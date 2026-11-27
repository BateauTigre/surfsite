"""Vérification du site dans un vrai navigateur, avec les vraies données et la vraie carte.

Lancée par GitHub Actions (.github/workflows/verifications.yml) :
    python tests/live/navigateur.py http://127.0.0.1:8000/ captures

Charge l'accueil et des fiches spot sur ordinateur et sur mobile, vérifie le top 10,
les 15 jours, les 124 pastilles de la carte, les erreurs de console et les requêtes
en échec, zoome sur quelques spots pour contrôler leur position sur la côte, et
enregistre des captures d'écran dans le dossier de sortie.
"""
import json
import os
import shutil
import sys
import time

from playwright.sync_api import sync_playwright

ON_CI = bool(os.environ.get("GITHUB_ACTIONS"))
ZOOM_SPOTS = ["la-nord", "la-torche", "cote-des-basques", "etretat"]


def annotate(kind, title, message):
    text = str(message).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::{kind} title={title}::{text}" if ON_CI else f"\n[{kind}] {title}\n{message}", flush=True)


def main(base, out, prepare=None, executable=None):
    os.makedirs(out, exist_ok=True)
    report = {"console": [], "network": [], "failed": [], "checks": {}, "problems": []}
    tiles = {"ok": 0, "ko": 0}

    def shot(page, name, **kw):
        page.screenshot(path=os.path.join(out, f"{name}.png"), **kw)

    def on_console(m):
        if m.type not in ("error", "warning"):
            return
        url = (m.location or {}).get("url", "")
        # Coupure réseau entre GitHub et Open-Meteo : pas un défaut du site (le site affiche
        # alors un bandeau et les données disponibles). Une erreur HTTP reste comptée.
        if m.text.startswith("Failed to load resource: net::") and "open-meteo.com" in url:
            report["network"].append(f"{m.text} ({url[:90]})")
            return
        report["console"].append(f"{m.type}: {m.text}")

    def watch(page):
        page.on("console", on_console)
        page.on("pageerror", lambda e: report["console"].append(f"pageerror: {e}"))
        # Les tuiles annulées pendant un zoom (net::ERR_ABORTED) sont normales.
        page.on("requestfailed", lambda r: None if "ERR_ABORTED" in (r.failure or "") else report["failed"].append(f"{r.url[:140]} ({r.failure})"))

        def on_response(r):
            if "openfreemap.org" in r.url:
                tiles["ok" if r.status < 400 else "ko"] += 1
            elif r.status >= 400:
                report["failed"].append(f"{r.url[:140]} (HTTP {r.status})")

        page.on("response", on_response)

    def check(name, ok, detail=""):
        report["checks"][name] = {"ok": bool(ok), "detail": detail}
        if not ok:
            report["problems"].append(f"{name} : {detail}")

    def wait_home(page):
        t0 = time.time()
        page.wait_for_selector("#top10-list .rank-item", timeout=90_000)
        return time.time() - t0

    def wait_map(page):
        try:
            page.wait_for_selector(".maplibregl-canvas, .map-fallback", timeout=60_000)
            page.wait_for_load_state("networkidle", timeout=30_000)
        except Exception:
            pass
        page.wait_for_timeout(1500)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=executable or shutil.which("google-chrome") or shutil.which("chromium"),
            args=["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
        )

        # ── Ordinateur ──
        ctx = browser.new_context(viewport={"width": 1440, "height": 1400}, locale="fr-FR", timezone_id="Europe/Paris")
        if prepare:
            prepare(ctx)
        page = ctx.new_page()
        watch(page)
        page.goto(base, wait_until="domcontentloaded")
        elapsed = wait_home(page)
        wait_map(page)

        names = page.eval_on_selector_all("#top10-list .rank-name", "els => els.map(e => e.textContent.trim())")
        status = page.inner_text("#status-text")
        banner = page.evaluate("(() => { const b = document.querySelector('#banner'); return b && !b.hidden ? b.innerText.trim() : ''; })()")
        chips = page.eval_on_selector_all("#day-picker .day-chip", "els => els.length")
        markers = page.eval_on_selector_all(".marker", "els => els.length")
        canvas = page.query_selector(".maplibregl-canvas") is not None
        fallback = page.query_selector(".map-fallback")

        check("Top 10", len(names) == 10, f"{len(names)} spots, affiché en {elapsed:.1f} s")
        check("Statut", "Mis à jour" in status, status)
        check("15 jours", chips == 15, f"{chips} jours")
        check("Carte", canvas and not fallback, fallback.inner_text() if fallback else "MapLibre chargé")
        check("Pastilles", markers == 124, f"{markers} pastilles")
        check("Fond de carte", tiles["ok"] > 0 and tiles["ko"] == 0, f"{tiles['ok']} réponses OpenFreeMap, {tiles['ko']} en erreur")
        if banner:
            report["checks"]["Bandeau"] = {"ok": True, "detail": banner}
        shot(page, "01-accueil", full_page=True)

        # Fenêtre d'info d'une pastille.
        if markers:
            page.locator(".marker[data-id='la-torche']").click(force=True)
            page.wait_for_timeout(600)
            popup = page.query_selector(".maplibregl-popup")
            check("Fenêtre de la carte", popup is not None, popup.inner_text().replace("\n", " · ")[:120] if popup else "absente")
            page.locator("#map").screenshot(path=os.path.join(out, "02-carte-fenetre.png"))

        # Zoom sur quelques spots pour vérifier leur position par rapport à la côte.
        if canvas and markers:
            for sid in ZOOM_SPOTS:
                page.reload(wait_until="domcontentloaded")
                wait_home(page)
                wait_map(page)
                box = page.locator(f".marker[data-id='{sid}']").bounding_box()
                if not box:
                    check(f"Zoom {sid}", False, "pastille introuvable")
                    continue
                page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
                for _ in range(9):
                    page.mouse.wheel(0, -480)
                    page.wait_for_timeout(260)
                try:
                    page.wait_for_load_state("networkidle", timeout=15_000)
                except Exception:
                    pass
                page.wait_for_timeout(1500)
                zoom = page.get_attribute("#map", "data-zoom")
                check(f"Zoom {sid}", zoom == "near", f"niveau {zoom}")
                page.locator("#map").screenshot(path=os.path.join(out, f"03-zoom-{sid}.png"))

        # Fiche spot, vues heure par heure et 15 jours.
        page.goto(base + "#/spot/la-nord", wait_until="domcontentloaded")
        page.wait_for_selector(".spot-page h1", timeout=60_000)
        page.wait_for_timeout(800)
        cols = page.eval_on_selector_all(".fc-table thead th", "els => els.length")
        tide = page.query_selector(".card svg path") is not None
        check("Fiche spot", cols > 5, f"{cols} colonnes, courbe de marée {'oui' if tide else 'non'}")
        shot(page, "04-fiche-la-nord", full_page=True)
        page.click("[data-mode='week']")
        page.wait_for_timeout(400)
        shot(page, "05-fiche-15-jours")

        # Recherche.
        page.fill("#search-input", "hossegor")
        page.wait_for_selector("#search-results [role=option]", timeout=5_000)
        found = page.eval_on_selector_all("#search-results [role=option]", "els => els.length")
        check("Recherche", found > 0, f"{found} résultats pour « hossegor »")
        ctx.close()

        # ── Mobile ──
        m = browser.new_context(
            viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
            locale="fr-FR", timezone_id="Europe/Paris",
        )
        if prepare:
            prepare(m)
        mp = m.new_page()
        watch(mp)
        mp.goto(base, wait_until="domcontentloaded")
        wait_home(mp)
        wait_map(mp)
        shot(mp, "06-mobile-accueil")
        mp.locator("#map").scroll_into_view_if_needed()
        mp.wait_for_timeout(1200)
        shot(mp, "07-mobile-carte")
        overflow = mp.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("Mobile sans défilement horizontal", overflow <= 0, f"{overflow} px de trop")
        mp.goto(base + "#/spot/la-torche", wait_until="domcontentloaded")
        mp.wait_for_selector(".spot-page h1", timeout=60_000)
        mp.wait_for_timeout(800)
        shot(mp, "08-mobile-fiche", full_page=True)
        m.close()
        browser.close()

    errors = [c for c in report["console"] if not c.startswith("warning")]
    if errors:
        report["problems"].append(f"{len(errors)} erreur(s) dans la console")

    lines = [f"{'OK ' if c['ok'] else 'KO '} {k} : {c['detail']}" for k, c in report["checks"].items()]
    annotate("notice", "Navigateur", "\n".join(lines))
    if report["console"]:
        annotate("warning", "Console", "\n".join(report["console"][:25]))
    if report["network"]:
        annotate("warning", "Open-Meteo injoignable par moments (réseau GitHub)", "\n".join(report["network"][:10]))
    if report["failed"]:
        annotate("warning", "Requêtes en échec", "\n".join(report["failed"][:25]))
    for prob in report["problems"]:
        annotate("error", "Problème", prob)
    with open(os.path.join(out, "navigateur.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    return 1 if report["problems"] else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "captures"))
