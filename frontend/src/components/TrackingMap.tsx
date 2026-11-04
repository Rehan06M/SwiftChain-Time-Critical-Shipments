import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export type MapPoint = [number, number];

interface Props {
  origin: MapPoint | null;
  destination: MapPoint | null;
  current: MapPoint | null;
}

export default function TrackingMap(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const latestProps = useRef(props);
  const updateMap = useRef<(() => void) | null>(null);
  const [error, setError] = useState("");

  latestProps.current = props;

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;
    let ready = false;
    let fittedRoute = "";

    const markers = new Map<string, maplibregl.Marker>();

    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [73.4, 18.8],
      zoom: 7,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [
              "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
          },
        ],
      },
    });

    map.addControl(new maplibregl.NavigationControl());

    function update() {
      if (!ready || disposed) return;

      const { origin, destination, current } =
        latestProps.current;

      const points = [
        { key: "origin", point: origin, color: "#16a34a" },
        {
          key: "destination",
          point: destination,
          color: "#dc2626",
        },
        { key: "current", point: current, color: "#2563eb" },
      ];

      for (const { key, point, color } of points) {
        if (!point) {
          markers.get(key)?.remove();
          markers.delete(key);
          continue;
        }

        let marker = markers.get(key);

        if (!marker) {
          marker = new maplibregl.Marker({ color })
            .setLngLat(point)
            .addTo(map);

          markers.set(key, marker);
        } else {
          marker.setLngLat(point);
        }
      }

      const source = map.getSource(
        "demo-route"
      ) as maplibregl.GeoJSONSource | undefined;

      source?.setData({
        type: "FeatureCollection",
        features:
          origin && destination
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: [origin, destination],
                  },
                },
              ]
            : [],
      });

      // Fit once for each route, without resetting the camera
      // for every location update.
      if (origin && destination) {
        const routeKey = JSON.stringify([origin, destination]);

        if (routeKey !== fittedRoute) {
          fittedRoute = routeKey;

          const bounds = new maplibregl.LngLatBounds()
            .extend(origin)
            .extend(destination);

          if (current) bounds.extend(current);

          map.resize();

          map.fitBounds(bounds, {
            padding: 60,
            maxZoom: 12,
            duration: 0,
          });
        }
      } else if (current && fittedRoute !== "location") {
        fittedRoute = "location";

        map.jumpTo({
          center: current,
          zoom: 11,
        });
      }
    }

    updateMap.current = update;

    map.on("style.load", () => {
      if (disposed) return;

      map.addSource("demo-route", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "demo-route-line",
        type: "line",
        source: "demo-route",
        paint: {
          "line-color": "#2563eb",
          "line-width": 4,
          "line-dasharray": [2, 2],
        },
      });

      ready = true;
      update();
    });

    map.on("error", (event) => {
      console.error("Tracking map error:", event.error);

      if (!disposed) {
        setError(
          event.error?.message ?? "A map resource failed to load."
        );
      }
    });

    const observer = new ResizeObserver(() => {
      map.resize();
    });

    observer.observe(containerRef.current);

    return () => {
      disposed = true;
      updateMap.current = null;
      observer.disconnect();

      for (const marker of markers.values()) {
        marker.remove();
      }

      map.remove();
    };
  }, []);

  useEffect(() => {
    updateMap.current?.();
  }, [props.origin, props.destination, props.current]);

  return (
    <div>
      <div
        ref={containerRef}
        className="tracking-map"
        style={{ width: "100%", height: 340 }}
        aria-label="Shipment tracking map"
      />

      {error && (
        <p className="tracking-muted" role="status">
          Map notice: {error}
        </p>
      )}

      <p className="tracking-muted">
        Green: pickup · Red: destination · Blue: latest location.
        The dashed line is a straight simulation path.
      </p>
    </div>
  );
}