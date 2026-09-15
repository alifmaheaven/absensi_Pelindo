import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors, type ThemeColors } from "@/hooks/use-theme-color";
import StatusBadge from "@/components/ui/StatusBadge";
import {
  evaluateAttendanceMap,
  formatCoordinatePair,
  formatDistanceMeters,
  getGeofenceStatusLabel,
  isFatalHttpError,
  shouldFallbackToCoordinates,
  type AttendanceMapViewProps,
  type GeofenceStatus,
} from "@/components/attendance/attendance-map-logic";

export type { AttendanceMapViewProps };

const DEFAULT_HEIGHT = 220;

/**
 * Jendela tenggang sebelum kegagalan WebView dianggap fatal. Mencegah peta
 * yang lambat memuat (koneksi pelabuhan yang lelet) digantikan kartu fallback
 * secara keliru.
 */
const MAP_LOAD_GRACE_MS = 8000;

/** Memetakan status geofence ke tone StatusBadge yang tersedia. */
function statusTone(status: GeofenceStatus) {
  switch (status) {
    case "inside":
      return "success" as const;
    case "outside":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function statusIconName(status: GeofenceStatus) {
  switch (status) {
    case "inside":
      return "checkmark-circle" as const;
    case "outside":
      return "alert-circle" as const;
    default:
      return "help-circle-outline" as const;
  }
}

/**
 * Peta presensi untuk modal detail: menampilkan titik check-in, titik
 * check-out (bila ada), dan lingkaran radius geofence site, lengkap dengan
 * legenda + status di dalam/luar radius.
 *
 * Leaflet dimuat via WebView (CDN yang sama dengan `components/ui/map-embed.tsx`)
 * — TIDAK ada pustaka native baru.
 *
 * Degradasi (temuan audit MOB-03): bila koordinat tidak lengkap ATAU WebView
 * gagal memuat, komponen menampilkan kartu koordinat numerik yang rapi —
 * bukan kotak putih kosong.
 */
export default function AttendanceMapView({
  checkinLocation = null,
  checkoutLocation = null,
  siteLocation = null,
  radiusMeters = null,
  height = DEFAULT_HEIGHT,
  siteName = null,
}: AttendanceMapViewProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [webViewFailed, setWebViewFailed] = useState(false);
  const hasLoadedRef = useRef(false);
  // 0 = belum ditandai; diisi di dalam effect (bukan saat render) agar
  // komponen tetap murni sesuai react-hooks/purity.
  const mountedAtRef = useRef(0);

  const evaluation = useMemo(
    () =>
      evaluateAttendanceMap({
        checkinLocation,
        checkoutLocation,
        siteLocation,
        radiusMeters,
      }),
    [checkinLocation, checkoutLocation, siteLocation, radiusMeters]
  );

  const { checkin, checkout, site, radiusMeters: validRadius } = evaluation;

  const showMap = evaluation.canRenderMap && !webViewFailed;

  /**
   * Menandai kegagalan HANYA bila benar-benar fatal (dokumen utama gagal,
   * bukan satu tile/CDN), dan hanya bila peta belum pernah berhasil dimuat
   * atau sudah melewati jendela tenggang.
   */
  const markFailedIfFatal = useCallback((url?: string | null) => {
    if (!isFatalHttpError(url)) return;
    const startedAt = mountedAtRef.current;
    // Bila waktu mulai belum ditandai (effect belum jalan), anggap masih di
    // dalam tenggang → jangan jatuh ke fallback.
    const elapsedMs = startedAt === 0 ? 0 : Date.now() - startedAt;
    if (
      !shouldFallbackToCoordinates({
        hasLoaded: hasLoadedRef.current,
        elapsedMs,
        graceMs: MAP_LOAD_GRACE_MS,
      })
    ) {
      return;
    }
    setWebViewFailed(true);
  }, []);

  const handleHttpError = useCallback(
    (event: { nativeEvent?: { url?: string } }) => {
      markFailedIfFatal(event?.nativeEvent?.url);
    },
    [markFailedIfFatal]
  );

  // `evaluateAttendanceMap()` mengembalikan objek `{lat, lng}` BARU setiap
  // render, sehingga `checkin.point`/`checkout.point`/`site` selalu berubah
  // identitasnya dan memo di bawah tidak pernah kena. Turunkan dependency
  // PRIMITIF (dibandingkan berdasarkan nilai) agar memo benar-benar hit.
  const checkinLat = checkin.point?.lat ?? null;
  const checkinLng = checkin.point?.lng ?? null;
  const checkoutLat = checkout.point?.lat ?? null;
  const checkoutLng = checkout.point?.lng ?? null;
  const siteLat = site?.lat ?? null;
  const siteLng = site?.lng ?? null;

  const mapHTML = useMemo(() => {
    if (!showMap) return "";
    // Objek titik dibaca dari `evaluation` (bukan dari dependency) — nilainya
    // dijamin konsisten dengan primitif di atas pada render yang sama.
    return buildMapHTML({
      checkin: checkin.point,
      checkout: checkout.point,
      site,
      radiusMeters: validRadius,
      colors,
    });
    // `colors` identity sudah dimemo per skema warna di useThemeColors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showMap,
    checkinLat,
    checkinLng,
    checkoutLat,
    checkoutLng,
    siteLat,
    siteLng,
    validRadius,
    colors,
  ]);

  // `source` juga harus stabil: objek literal baru setiap render dapat memicu
  // WebView memuat ulang dokumen meski string HTML-nya identik.
  const webViewSource = useMemo(() => ({ html: mapHTML }), [mapHTML]);

  // Reset penanda muat setiap kali dokumen peta dibangun ulang.
  useEffect(() => {
    mountedAtRef.current = Date.now();
    hasLoadedRef.current = false;
  }, [mapHTML]);

  return (
    <View style={styles.container}>
      <View style={[styles.mapFrame, { height }]}>
        {showMap ? (
          <WebView
            source={webViewSource}
            style={styles.webview}
            originWhitelist={[]}
            javaScriptEnabled
            domStorageEnabled={false}
            startInLoadingState={false}
            scalesPageToFit={false}
            mixedContentMode="never"
            allowsInlineMediaPlayback
            // onError = kegagalan memuat dokumen utama → sinyal fatal.
            onError={() => setWebViewFailed(true)}
            // onHttpError bisa terpicu per sub-resource (tile/CDN); hanya
            // dokumen utama yang dianggap fatal agar satu tile gagal tidak
            // menggantikan peta yang sebenarnya berfungsi.
            onHttpError={handleHttpError}
            // Peta yang berhasil memuat tidak boleh jatuh ke fallback lagi.
            onLoadEnd={() => {
              hasLoadedRef.current = true;
            }}
            testID="attendance-map-webview"
          />
        ) : (
          <CoordinateFallback
            styles={styles}
            colors={colors}
            siteName={siteName}
            checkin={checkin.point}
            checkout={checkout.point}
            site={site}
          />
        )}
      </View>

      <Legend
        styles={styles}
        colors={colors}
        hasCheckout={Boolean(checkout.point)}
      />

      <View style={styles.statusList}>
        <StatusRow
          styles={styles}
          colors={colors}
          index={1}
          title="Check-in"
          evaluation={checkin}
          radiusMeters={validRadius}
        />
        {checkout.point || checkout.distanceMeters != null ? (
          <StatusRow
            styles={styles}
            colors={colors}
            index={2}
            title="Check-out"
            evaluation={checkout}
            radiusMeters={validRadius}
          />
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-komponen                                                        */
/* ------------------------------------------------------------------ */

function CoordinateFallback({
  styles,
  colors,
  siteName,
  checkin,
  checkout,
  site,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  siteName?: string | null;
  checkin: { lat: number; lng: number } | null;
  checkout: { lat: number; lng: number } | null;
  site: { lat: number; lng: number } | null;
}) {
  return (
    <View style={styles.fallback} testID="attendance-map-fallback">
      <View style={styles.fallbackHeader}>
        <Ionicons name="map-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.fallbackTitle}>
          {siteName ? `Koordinat — ${siteName}` : "Koordinat Presensi"}
        </Text>
      </View>

      <FallbackRow
        styles={styles}
        colors={colors}
        dotColor={colors.success}
        label="Check-in"
        value={formatCoordinatePair(checkin)}
      />
      {checkout ? (
        <FallbackRow
          styles={styles}
          colors={colors}
          dotColor={colors.danger}
          label="Check-out"
          value={formatCoordinatePair(checkout)}
        />
      ) : null}
      <FallbackRow
        styles={styles}
        colors={colors}
        dotColor={colors.primary}
        label="Site"
        value={formatCoordinatePair(site)}
      />
    </View>
  );
}

function FallbackRow({
  styles,
  colors,
  dotColor,
  label,
  value,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  dotColor: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.fallbackRow}>
      <View style={[styles.legendDot, { backgroundColor: dotColor }]} />
      <Text style={styles.fallbackLabel}>{label}</Text>
      <Text style={styles.fallbackValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Legend({
  styles,
  colors,
  hasCheckout,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  hasCheckout: boolean;
}) {
  const items: { color: string; label: string }[] = [
    { color: colors.success, label: "Check-in" },
  ];
  if (hasCheckout) {
    items.push({ color: colors.danger, label: "Check-out" });
  }
  items.push({ color: colors.primary, label: "Radius Site" });

  return (
    <View style={styles.legend} testID="attendance-map-legend">
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <Text style={styles.legendText}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function StatusRow({
  styles,
  colors,
  index,
  title,
  evaluation,
  radiusMeters,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColors;
  index: number;
  title: string;
  evaluation: { distanceMeters: number | null; status: GeofenceStatus };
  radiusMeters: number | null;
}) {
  const dotColor = index === 1 ? colors.success : colors.danger;

  return (
    <View style={styles.statusRow} testID={`attendance-map-status-${index}`}>
      <View style={styles.statusLeft}>
        <View style={[styles.legendDot, { backgroundColor: dotColor }]} />
        <Text style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusDistance}>
          {formatDistanceMeters(evaluation.distanceMeters)}
          {radiusMeters != null ? ` / ${Math.round(radiusMeters)} m` : ""}
        </Text>
      </View>
      <StatusBadge
        label={getGeofenceStatusLabel(evaluation.status)}
        tone={statusTone(evaluation.status)}
        size="small"
        icon={
          <Ionicons
            name={statusIconName(evaluation.status)}
            size={12}
            color={
              evaluation.status === "inside"
                ? colors.success
                : evaluation.status === "outside"
                ? colors.danger
                : colors.textSecondary
            }
          />
        }
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* HTML peta                                                           */
/* ------------------------------------------------------------------ */

/**
 * Membangun dokumen Leaflet. Semua nilai numerik sudah divalidasi oleh
 * `evaluateAttendanceMap`, sehingga interpolasi ke dalam script aman.
 */
export function buildMapHTML(params: {
  checkin: { lat: number; lng: number } | null;
  checkout: { lat: number; lng: number } | null;
  site: { lat: number; lng: number } | null;
  radiusMeters: number | null;
  colors: ThemeColors;
}): string {
  const { checkin, checkout, site, radiusMeters, colors } = params;

  const markers: string[] = [];
  const boundsPoints: string[] = [];

  if (checkin) {
    markers.push(
      `L.circleMarker([${checkin.lat}, ${checkin.lng}], ${circleMarkerOptions(
        colors.success
      )}).addTo(map).bindPopup('Check-in');`
    );
    boundsPoints.push(`[${checkin.lat}, ${checkin.lng}]`);
  }

  if (checkout) {
    markers.push(
      `L.circleMarker([${checkout.lat}, ${checkout.lng}], ${circleMarkerOptions(
        colors.danger
      )}).addTo(map).bindPopup('Check-out');`
    );
    boundsPoints.push(`[${checkout.lat}, ${checkout.lng}]`);
  }

  if (site) {
    markers.push(
      `L.circleMarker([${site.lat}, ${site.lng}], ${circleMarkerOptions(
        colors.primary
      )}).addTo(map).bindPopup('Titik Site');`
    );
    boundsPoints.push(`[${site.lat}, ${site.lng}]`);
  }

  const geofence =
    site && radiusMeters != null
      ? `
      var geofence = L.circle([${site.lat}, ${site.lng}], {
        color: '${colors.primary}',
        fillColor: '${colors.primary}',
        fillOpacity: 0.15,
        radius: ${radiusMeters},
        weight: 2
      }).addTo(map);
      boundsLayer.push(geofence);
      `
      : "";

  // Pusat awal peta: titik pertama yang tersedia (minimal salah satu ada,
  // karena buildMapHTML hanya dipanggil saat canRenderMap true).
  const initialCenter =
    checkin || checkout || site || { lat: -2.5, lng: 118 };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: ${colors.surface}; }
        #map { width: 100%; height: 100%; }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        try {
          var map = L.map('map', {
            center: [${initialCenter.lat}, ${initialCenter.lng}],
            zoom: 16,
            zoomControl: true,
            attributionControl: true
          });

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
          }).addTo(map);

          var boundsLayer = [];
          var pointCoords = [${boundsPoints.join(", ")}];

          ${markers.join("\n          ")}

          pointCoords.forEach(function (c) {
            boundsLayer.push(L.marker(c, { opacity: 0, interactive: false }));
          });

          ${geofence}

          if (boundsLayer.length > 0) {
            var group = new L.featureGroup(boundsLayer);
            map.fitBounds(group.getBounds().pad(0.2), { maxZoom: 18 });
          }
        } catch (e) {
          // Biarkan peta kosong; sisi React Native tetap menampilkan legenda
          // dan status numerik, sehingga tidak ada kotak putih tanpa konteks.
        }
      </script>
    </body>
    </html>
  `;
}

function circleMarkerOptions(color: string): string {
  return `{
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: '${color}',
          fillOpacity: 1
        }`;
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: "100%",
      gap: 8,
    },
    mapFrame: {
      width: "100%",
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    webview: {
      flex: 1,
      backgroundColor: c.surface,
    },
    fallback: {
      flex: 1,
      padding: 12,
      gap: 6,
      justifyContent: "center",
      backgroundColor: c.surface,
    },
    fallbackHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 2,
    },
    fallbackTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: c.textSecondary,
    },
    fallbackRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    fallbackLabel: {
      fontSize: 12,
      color: c.textSecondary,
      width: 70,
    },
    fallbackValue: {
      fontSize: 12,
      color: c.textStrong,
      fontWeight: "600",
      flexShrink: 1,
    },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 2,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    legendText: {
      fontSize: 12,
      color: c.textSecondary,
    },
    statusList: {
      gap: 6,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    statusLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexShrink: 1,
    },
    statusTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textStrong,
    },
    statusDistance: {
      fontSize: 12,
      color: c.textSecondary,
    },
  });
