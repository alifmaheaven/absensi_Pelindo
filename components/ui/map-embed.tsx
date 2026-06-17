import * as Location from "expo-location";
import React, { useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

interface MapEmbedProps {
  location: Location.LocationObject | null;
}

export const MapEmbed: React.FC<MapEmbedProps> = ({ location }) => {
  const webViewRef = useRef<WebView>(null);

  const createMapHTML = () => {
    const lat = location?.coords?.latitude ?? -2.5;
    const lon = location?.coords?.longitude ?? 118;
    const zoom = 18;

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
          L.marker([${lat}, ${lon}]).addTo(map);
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
        originWhitelist={["*"]}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={false}
        scalesPageToFit={false}
        mixedContentMode="always"
        allowsInlineMediaPlayback={true}
      />
    </View>
  );
};
