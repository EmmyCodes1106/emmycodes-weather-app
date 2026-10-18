import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import './App.css';

// Type definitions for Open-Meteo Geocoding API response
interface OpenMeteoGeocodingResponse {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
  }>;
}

// Type definitions for Photon Geocoding API response (fallback)
interface PhotonGeocodingResponse {
  features?: Array<{
    properties?: {
      name?: string;
      country?: string;
    };
    geometry?: {
      coordinates?: [number, number]; // [longitude, latitude]
    };
  }>;
}

// Type definition for a single day in the 3-day forecast
interface DailyForecastDay {
  date: string;
  dayLabel: string;
  maxTemp: number;
  minTemp: number;
}

// Type definitions for Open-Meteo Weather Forecast API response
interface WeatherResponse {
  current?: {
    temperature_2m: number;
    time: string;
  };
  current_units?: {
    temperature_2m: string;
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
  daily_units?: {
    temperature_2m_max?: string;
    temperature_2m_min?: string;
  };
  error?: boolean;
  reason?: string;
}

interface GeocodedLocation {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
}

function App() {
  const [cityInput, setCityInput] = useState<string>('');
  const [currentCity, setCurrentCity] = useState<string>('Lagos');
  const [currentCountry, setCurrentCountry] = useState<string>('Nigeria');
  const [temperature, setTemperature] = useState<number | null>(null);
  const [unit, setUnit] = useState<string>('°C');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [forecast, setForecast] = useState<DailyForecastDay[]>([]);
  const [observationTime, setObservationTime] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Helper to format date label (e.g. Tomorrow, Tue, Wed)
  const formatDayLabel = (dateStr: string, index: number): string => {
    if (index === 0) return 'Tomorrow';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  };

  // Helper to extract the next 3 days from daily forecast data
  const parseNext3Days = (daily?: WeatherResponse['daily']): DailyForecastDay[] => {
    if (!daily?.time || daily.time.length < 2) return [];
    const days: DailyForecastDay[] = [];
    // Start from index 1 (next 3 days after today, which is index 0)
    for (let i = 1; i < Math.min(4, daily.time.length); i++) {
      days.push({
        date: daily.time[i],
        dayLabel: formatDayLabel(daily.time[i], i - 1),
        maxTemp: daily.temperature_2m_max[i],
        minTemp: daily.temperature_2m_min[i],
      });
    }
    return days;
  };

  // Helper to geocode a city using Open-Meteo with 2s timeout, falling back to Photon
  const geocodeCity = async (cityName: string): Promise<GeocodedLocation> => {
    const encoded = encodeURIComponent(cityName.trim());

    // Attempt 1: Open-Meteo Geocoding with a 2-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encoded}&count=1`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const data: OpenMeteoGeocodingResponse = await res.json();
        if (data.results && data.results.length > 0) {
          const match = data.results[0];
          return {
            name: match.name,
            country: match.country || '',
            latitude: match.latitude,
            longitude: match.longitude,
          };
        }
      }
    } catch {
      // Open-Meteo timed out or failed; proceed to Photon backup
    } finally {
      clearTimeout(timeoutId);
    }

    // Attempt 2: Photon Backup API
    const photonRes = await fetch(
      `https://photon.komoot.io/api/?q=${encoded}&limit=1&layer=city`
    );
    if (photonRes.ok) {
      const photonData: PhotonGeocodingResponse = await photonRes.json();
      if (photonData.features && photonData.features.length > 0) {
        const match = photonData.features[0];
        const [lon, lat] = match.geometry?.coordinates || [];
        if (lat !== undefined && lon !== undefined) {
          return {
            name: match.properties?.name || cityName,
            country: match.properties?.country || '',
            latitude: lat,
            longitude: lon,
          };
        }
      }
    }

    throw new Error('City not found');
  };

  // Helper to fetch forecast (current + next 3 days) with retry
  const fetchForecast = async (lat: number, lon: number): Promise<WeatherResponse> => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&daily=temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto`;
    let res = await fetch(url);
    let data: WeatherResponse = await res.json();

    // Single retry if server reports temporary overload
    if (data.error && data.reason?.includes('overloaded')) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      res = await fetch(url);
      data = await res.json();
    }

    if (data.error || !res.ok) {
      throw new Error(data.reason || 'Failed to reach weather service');
    }

    return data;
  };

  // Main fetch function for any city: updates current temperature & 3-day forecast
  const fetchWeatherForCity = async (cityName: string) => {
    setLoading(true);
    setError(null);

    try {
      // 1. Geocode city name to coordinates
      const location = await geocodeCity(cityName);
      setCurrentCity(location.name);
      setCurrentCountry(location.country);
      setCoords({ lat: location.latitude, lon: location.longitude });

      // 2. Fetch forecast data for coordinates
      const weatherData = await fetchForecast(location.latitude, location.longitude);

      if (weatherData.current?.temperature_2m !== undefined) {
        setTemperature(weatherData.current.temperature_2m);
        setUnit(weatherData.current_units?.temperature_2m || '°C');
        if (weatherData.current.time) {
          setObservationTime(weatherData.current.time.replace('T', ' '));
        }
        setForecast(parseNext3Days(weatherData.daily));
      } else {
        throw new Error('Temperature data unavailable');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Form submit handler for searching a city
  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cityInput.trim()) return;
    fetchWeatherForCity(cityInput.trim());
    setCityInput('');
  };

  // Initial load for Lagos on component mount
  useEffect(() => {
    let ignore = false;

    async function initialLoad() {
      try {
        const res = await fetch(
          'https://geocoding-api.open-meteo.com/v1/search?name=Lagos&count=1'
        );
        if (!res.ok) throw new Error('Failed to reach geocoding service');
        const data: OpenMeteoGeocodingResponse = await res.json();
        if (!data.results || data.results.length === 0) {
          throw new Error('City not found');
        }

        const { latitude, longitude, name, country } = data.results[0];

        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&daily=temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto`
        );
        if (!weatherRes.ok) throw new Error('Failed to reach weather service');
        const weatherData: WeatherResponse = await weatherRes.json();

        if (!ignore) {
          setCurrentCity(name);
          setCurrentCountry(country || 'Nigeria');
          setCoords({ lat: latitude, lon: longitude });
          if (weatherData.current?.temperature_2m !== undefined) {
            setTemperature(weatherData.current.temperature_2m);
            setUnit(weatherData.current_units?.temperature_2m || '°C');
            if (weatherData.current.time) {
              setObservationTime(weatherData.current.time.replace('T', ' '));
            }
          }
          if (weatherData.daily?.time && weatherData.daily.time.length > 1) {
            const days: DailyForecastDay[] = [];
            for (let i = 1; i < Math.min(4, weatherData.daily.time.length); i++) {
              days.push({
                date: weatherData.daily.time[i],
                dayLabel: i === 1 ? 'Tomorrow' : new Date(weatherData.daily.time[i] + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }),
                maxTemp: weatherData.daily.temperature_2m_max[i],
                minTemp: weatherData.daily.temperature_2m_min[i],
              });
            }
            setForecast(days);
          }
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'An unexpected error occurred');
          setLoading(false);
        }
      }
    }

    initialLoad();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <main className="app-container">
      <div className="weather-card">
        {/* Header with live badge and API badge */}
        <header className="card-header">
          <span className="live-badge">
            <span className="pulse-dot"></span>
            Live Weather
          </span>
          <span className="api-source">Open-Meteo & Photon</span>
        </header>

        {/* Piece 1: Search box form */}
        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-input-wrapper">
            <svg
              className="search-icon-left"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Search city (e.g. Lagos, Abuja)..."
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              disabled={loading}
              aria-label="City search input"
            />
          </div>
          <button
            type="submit"
            className="search-button"
            disabled={loading || !cityInput.trim()}
          >
            Search
          </button>
        </form>

        {/* Piece 2: Current Weather Section */}
        <section className="current-weather-section">
          <div className="section-label-row">
            <span className="current-weather-tag">Current Weather</span>
            {observationTime && (
              <span className="observation-time">Observed {observationTime}</span>
            )}
          </div>

          <div className="location-section">
            <h1 className="city-title">{currentCity}</h1>
            {currentCountry && <p className="country-name">{currentCountry}</p>}
          </div>

          {/* Main temperature and status display */}
          {loading ? (
            <div className="status-box loading">
              <div className="spinner"></div>
              <p>Fetching weather for {currentCity}...</p>
            </div>
          ) : error ? (
            <div className="status-box error">
              <p>{error}</p>
            </div>
          ) : (
            <>
              <div className="temp-display">
                <div className="temp-glow"></div>
                <div className="temp-value">
                  <span>{temperature}</span>
                  <span className="temp-unit">{unit}</span>
                </div>
                <span className="temp-subtext">2m above ground</span>
              </div>

              {/* Coordinates metadata display */}
              {coords && (
                <div className="coords-grid">
                  <div className="coord-item">
                    <span className="coord-label">Latitude</span>
                    <span className="coord-value">{coords.lat.toFixed(2)}° N</span>
                  </div>
                  <div className="coord-item">
                    <span className="coord-label">Longitude</span>
                    <span className="coord-value">{coords.lon.toFixed(2)}° E</span>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Piece 3: Next 3 Days Section */}
        {forecast.length > 0 && !loading && !error && (
          <section className="forecast-section">
            <div className="forecast-header">
              <span className="forecast-title">Next 3 Days</span>
              <span className="forecast-badge">High / Low Forecast</span>
            </div>

            <div className="forecast-list">
              {forecast.map((day) => (
                <div key={day.date} className="forecast-card">
                  <div className="forecast-day-info">
                    <span className="forecast-day-name">{day.dayLabel}</span>
                    <span className="forecast-date">{day.date}</span>
                  </div>
                  <div className="forecast-temp-range">
                    <span className="temp-pill max" title="Highest temperature">
                      <span className="temp-arrow">▲</span>
                      <span>{day.maxTemp.toFixed(1)}°C</span>
                    </span>
                    <span className="temp-pill min" title="Lowest temperature">
                      <span className="temp-arrow">▼</span>
                      <span>{day.minTemp.toFixed(1)}°C</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Refresh button */}
        <button
          className="refresh-button"
          onClick={() => fetchWeatherForCity(currentCity)}
          disabled={loading}
          type="button"
        >
          <svg
            className="refresh-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
          {loading ? 'Updating...' : `Refresh ${currentCity}`}
        </button>

        <p className="footer-note">
          1. City → Coordinates (Geocoding API) • 2. Coordinates → Weather (Forecast API)
        </p>
      </div>
    </main>
  );
}

export default App;
