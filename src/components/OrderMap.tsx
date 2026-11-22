/**
 * Map point picker for the order form (Req 1, Req 9).
 *
 * Leaflet + OpenStreetMap tiles (free). Tap the map to set the active
 * point (pickup or destination); markers are draggable. Uses divIcon
 * markers (no image assets to break under the bundler).
 *
 * This component must be loaded with `ssr: false` (Leaflet needs
 * `window`) — see src/app/pesan/page.tsx.
 */
"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMapEvents,
} from "react-leaflet";
import { NGANJUK_CENTER, type LatLng } from "@/lib/geo";

export type MapPointKind = "pickup" | "dropoff";

interface OrderMapProps {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  activePoint: MapPointKind;
  onPointChange: (which: MapPointKind, point: LatLng) => void;
  /** Route line as [lng, lat] pairs (OSRM); null when unavailable. */
  routeGeometry: Array<[number, number]> | null;
}

function makeMarkerIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: "wijaya-marker",
    html:
      `<div style="display:flex;align-items:center;justify-content:center;` +
      `width:28px;height:28px;border-radius:50%;background:${color};` +
      `color:#fff;font-weight:700;font-size:14px;border:2px solid #fff;` +
      `box-shadow:0 1px 4px rgba(0,0,0,0.4);">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const PICKUP_ICON = makeMarkerIcon("J", "#16a34a");
const DROPOFF_ICON = makeMarkerIcon("T", "#dc2626");

function ClickHandler({
  onPick,
}: {
  onPick: (point: LatLng) => void;
}): null {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function OrderMap({
  pickup,
  dropoff,
  activePoint,
  onPointChange,
  routeGeometry,
}: OrderMapProps) {
  const routePositions: Array<[number, number]> | null = routeGeometry
    ? routeGeometry.map(([lng, lat]) => [lat, lng] as [number, number])
    : null;

  return (
    <MapContainer
      center={[NGANJUK_CENTER.lat, NGANJUK_CENTER.lng]}
      zoom={14}
      scrollWheelZoom
      style={{ height: 320, width: "100%", borderRadius: 8, zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler
        onPick={(point) => onPointChange(activePoint, point)}
      />
      {routePositions && (
        <Polyline positions={routePositions} color="#2563eb" weight={4} />
      )}
      {pickup && (
        <Marker
          position={[pickup.lat, pickup.lng]}
          icon={PICKUP_ICON}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target as L.Marker;
              const ll = marker.getLatLng();
              onPointChange("pickup", { lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      )}
      {dropoff && (
        <Marker
          position={[dropoff.lat, dropoff.lng]}
          icon={DROPOFF_ICON}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target as L.Marker;
              const ll = marker.getLatLng();
              onPointChange("dropoff", { lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      )}
    </MapContainer>
  );
}
