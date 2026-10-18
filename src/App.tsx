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

// Type definitions for Open-Meteo Weather Forecast API response
interface WeatherResponse {
  current?: {
    temperature_2m: number;
    time: string;
  };
  current_units?: {
    temperature_2m: string;
  };
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
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  // Main fetch function for any city
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
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m&timezone=auto`
      );

      if (!weatherRes.ok) {
        throw new Error('Failed to reach weather service');
      }

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

  // Form submit handler for searching a city
  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!cityInput.trim()) return;
    fetchWeatherForCity(cityInput.trim());
    setCityInput('');
  };

  // Initial load for Lagos
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
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&timezone=auto`
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

        {/* City and country title */}
        <section className="location-section">
          <h1 className="city-title">{currentCity}</h1>
          {currentCountry && <p className="country-name">{currentCountry}</p>}
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
