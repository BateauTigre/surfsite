// Fabrique des réponses Open-Meteo synthétiques (même format que l'API, timeformat=unixtime).

const DAY = 86400;

/** Minuit à Paris (en secondes UNIX) pour la date du jour, en hiver (UTC+1) comme en été (UTC+2). */
export function parisMidnight(now = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = fmt.format(new Date(now)).split('-').map(Number);
  for (const off of [1, 2]) {
    const t = Date.UTC(y, m - 1, d, 0, 0, 0) / 1000 - off * 3600;
    const back = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t * 1000));
    if (Number(back) === 0) return t;
  }
  return Date.UTC(y, m - 1, d) / 1000 - 3600;
}

export function hourlyTimes(days, start = parisMidnight()) {
  return Array.from({ length: days * 24 }, (_, i) => start + i * 3600);
}

export function marineResponse({ lat = 43.66, lon = -1.45, days = 15, swell = 1.6, period = 12, dir = 285, med = false } = {}) {
  const time = hourlyTimes(days);
  const n = time.length;
  const sw = time.map((_, i) => +(swell * (0.8 + 0.4 * Math.sin(i / 30))).toFixed(2));
  return {
    latitude: lat, longitude: lon, utc_offset_seconds: 3600, timezone: 'Europe/Paris',
    hourly: {
      time,
      wave_height: sw.map((h) => +(h * 1.1).toFixed(2)),
      wave_direction: time.map(() => dir),
      wave_period: time.map(() => period - 2),
      swell_wave_height: sw,
      swell_wave_direction: time.map(() => dir),
      swell_wave_period: time.map(() => period - 1),
      swell_wave_peak_period: time.map(() => period),
      wind_wave_height: time.map(() => 0.3),
      wind_wave_direction: time.map(() => dir - 10),
      wind_wave_period: time.map(() => 4),
      sea_level_height_msl: time.map((t, i) => (i < 240 ? +((med ? 0.1 : 2) * Math.sin((2 * Math.PI * (t - time[0])) / 44712)).toFixed(2) : null)),
      sea_surface_temperature: time.map((_, i) => (i < 240 ? 14.5 : null)),
    },
  };
}

export function weatherResponse({ lat = 43.66, lon = -1.45, days = 15, wind = 12, windDir = 95 } = {}) {
  const time = hourlyTimes(days);
  const daily = Array.from({ length: days }, (_, d) => time[0] + d * DAY);
  return {
    latitude: lat, longitude: lon, utc_offset_seconds: 3600, timezone: 'Europe/Paris',
    hourly: {
      time,
      wind_speed_10m: time.map((_, i) => +(wind * (0.6 + 0.6 * Math.max(0, Math.sin(((i % 24) - 9) / 4)))).toFixed(1)),
      wind_direction_10m: time.map((_, i) => ((i % 24) < 12 ? windDir : (windDir + 150) % 360)),
      wind_gusts_10m: time.map(() => wind * 1.6),
      temperature_2m: time.map((_, i) => 10 + 4 * Math.sin(((i % 24) - 8) / 4)),
      weather_code: time.map((_, i) => [0, 1, 2, 3, 61][i % 5]),
    },
    daily: { time: daily, sunrise: daily.map((t) => t + 8 * 3600 + 20 * 60), sunset: daily.map((t) => t + 17 * 3600 + 15 * 60) },
  };
}
