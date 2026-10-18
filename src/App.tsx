import { useState, useEffect } from 'react';
import './App.css';

// Type definition for Open-Meteo Geocoding API response
interface GeocodingResponse {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    country: string;
  }>;
}

// Type definition for Open-Meteo Weather Forecast API response
interface WeatherResponse {
  current?: {
    temperature_2m: number;
    time: string;
  };
  current_units?: {
    temperature_2m: string;
  };
}

function App() {
  // State to hold the current temperature
  const [temperature, setTemperature] = useState<number | null>(null);

  // State to hold the temperature unit (°C)
  const [unit, setUnit] = useState<string>('°C');

  // State to store coordinates returned by geocoding
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

  // State to track whether an API request is in progress
  const [loading, setLoading] = useState<boolean>(true);

  // State to store any error message
  const [error, setError] = useState<string | null>(null);

  // Fetch weather data for Lagos
  const fetchWeather = async () => {
    setLoading(true);
    setError(null);

    try {
      const geoRes = await fetch(
        'https://geocoding-api.open-meteo.com/v1/search?name=Lagos&count=1'
      );
      if (!geoRes.ok) throw new Error('Failed to reach geocoding service');
      const geoData: GeocodingResponse = await geoRes.json();

      if (!geoData.results || geoData.results.length === 0) {
        throw new Error('City not found');
      }

      const { latitude, longitude } = geoData.results[0];
      setCoords({ lat: latitude, lon: longitude });

      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`
      );
      if (!weatherRes.ok) throw new Error('Failed to reach weather service');
      const weatherData: WeatherResponse = await weatherRes.json();

      if (weatherData.current?.temperature_2m !== undefined) {
        setTemperature(weatherData.current.temperature_2m);
        setUnit(weatherData.current_units?.temperature_2m || '°C');
      } else {
        throw new Error('Temperature data unavailable');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Run initial fetch on mount
  useEffect(() => {
    let ignore = false;

    async function initialFetch() {
      try {
        const geoRes = await fetch(
          'https://geocoding-api.open-meteo.com/v1/search?name=Lagos&count=1'
        );
        if (!geoRes.ok) throw new Error('Failed to reach geocoding service');
        const geoData: GeocodingResponse = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) {
          throw new Error('City not found');
        }

        const { latitude, longitude } = geoData.results[0];

        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`
        );
        if (!weatherRes.ok) throw new Error('Failed to reach weather service');
        const weatherData: WeatherResponse = await weatherRes.json();

        if (!ignore) {
          setCoords({ lat: latitude, lon: longitude });
          if (weatherData.current?.temperature_2m !== undefined) {
            setTemperature(weatherData.current.temperature_2m);
            setUnit(weatherData.current_units?.temperature_2m || '°C');
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

    initialFetch();

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
          <span className="api-source">Open-Meteo API</span>
        </header>

        {/* City and country title */}
        <section className="location-section">
          <h1 className="city-title">Lagos</h1>
          <p className="country-name">Nigeria</p>
        </section>

        {/* Main temperature and status display */}
        {loading ? (
          <div className="status-box loading">
            <div className="spinner"></div>
            <p>Fetching weather data...</p>
          </div>
        ) : error ? (
          <div className="status-box error">
            <p>{error}</p>
          </div>
        ) : (
          <>
            <section className="temp-display">
              <div className="temp-glow"></div>
              <div className="temp-value">
                <span>{temperature}</span>
                <span className="temp-unit">{unit}</span>
              </div>
            </section>

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

        {/* Refresh button */}
        <button
          className="refresh-button"
          onClick={fetchWeather}
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
          {loading ? 'Updating...' : 'Refresh Weather'}
        </button>

        <p className="footer-note">
          1. City → Coordinates (Geocoding API) • 2. Coordinates → Weather (Forecast API)
        </p>
      </div>
    </main>
  );
}

export default App;
