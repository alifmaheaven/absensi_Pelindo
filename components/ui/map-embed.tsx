import { useThemeColors } from "@/hooks/use-theme-color";
import * as Location from "expo-location";
import React, { useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

import { Circle } from "react-native-maps";

export interface MapCenter {
  lat: number;
  lng: number;
}

export interface MapEmbedProps {
  location: Location.LocationObject | null;
  center?: MapCenter | null;
  radiusMeters?: number | null;
}

// Re-export Circle from react-native-maps for type/component parity
export { Circle };

export const MapEmbed: React.FC<MapEmbedProps> = ({
  location,
  center,
  radiusMeters,
}) => {
  const colors = useThemeColors();
  const webViewRef = useRef<WebView>(null);

  const createMapHTML = () => {
    const lat = location?.coords?.latitude ?? -2.5;
    const lon = location?.coords?.longitude ?? 118;
    const zoom = 18;

    const hasGeofence =
      center &&
      typeof center.lat === "number" &&
      !isNaN(center.lat) &&
      typeof center.lng === "number" &&
      !isNaN(center.lng) &&
      typeof radiusMeters === "number" &&
      !isNaN(radiusMeters) &&
      radiusMeters > 0;

    const strokeColor = colors.primary || "#1e90ff";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
          #map { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            center: [${lat}, ${lon}],
            zoom: ${zoom},
            zoomControl: true,
            attributionControl: true,
          });
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
          }).addTo(map);
          var userMarker = L.marker([${lat}, ${lon}]).addTo(map);
          ${
            hasGeofence
              ? `
          var geofenceCircle = L.circle([${center.lat}, ${center.lng}], {
            color: '${strokeColor}',
            fillColor: '${strokeColor}',
            fillOpacity: 0.15,
            radius: ${radiusMeters},
            weight: 2
          }).addTo(map);
          var group = new L.featureGroup([userMarker, geofenceCircle]);
          map.fitBounds(group.getBounds().pad(0.2));
          `
              : ""
          }
        </script>
      </body>
      </html>
    `;
  };

  if (!location) return null;

  return (
    <View style={{ width: "100%", height: 200 }}>
      <WebView
        ref={webViewRef}
        source={{ html: createMapHTML() }}
        style={{ width: "100%", height: 200 }}
        originWhitelist={[]}
        javaScriptEnabled={true}
        domStorageEnabled={false}
        startInLoadingState={false}
        scalesPageToFit={false}
        mixedContentMode="never"
        allowsInlineMediaPlayback={true}
      />
    </View>
  );
};
