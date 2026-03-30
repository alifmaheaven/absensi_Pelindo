import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

interface MapEmbedProps {
  location: Location.LocationObject | null;
}

export const MapEmbed: React.FC<MapEmbedProps> = ({ location }) => {
  // Referensi WebView
  const webViewRef = useRef<WebView>(null);

  // variables
  const [urlLocation, setUrlLocation] = useState<string | null>(null);

  // functions
  const createMapHTML = () => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            overflow: hidden;
          }
          iframe {
            width: 100%;
            height: 100%;
            border: none;
          }
        </style>
      </head>
      <body>
        <iframe
          id="mapFrame"
          src="${urlLocation || ""}"
          width="100%"
          height="100%"
          style="border:0;"
          allowfullscreen=""
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
        ></iframe>
      </body>
      </html>
    `;
  };

  // lifecycle
  useEffect(() => {
    if (location) {
      const zoom = 18;
      const lat = location.coords.latitude;
      const lon = location.coords.longitude;

      const googleMapsUrl = new URL("https://maps.google.com/maps");
      googleMapsUrl.searchParams.set("q", `${lat},${lon}`); // query coordinate
      googleMapsUrl.searchParams.set("z", zoom.toString()); // zoom
      googleMapsUrl.searchParams.set("output", "embed"); // display output
      googleMapsUrl.searchParams.set("hl", "id"); // host language
      googleMapsUrl.searchParams.set("gl", "ID"); // geo location

      setUrlLocation(googleMapsUrl.toString());
    }
  }, [location]);

  // Tambahan untuk memperbarui peta jika lokasi berubah
  useEffect(() => {
    if (webViewRef.current && urlLocation) {
      webViewRef.current.injectJavaScript(`
        document.getElementById('mapFrame').src = '${urlLocation}';
        true;
      `);
    }
  }, [urlLocation]);

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
        startInLoadingState={true}
        scalesPageToFit={true}
      />
    </View>
  );
};
