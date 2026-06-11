/**
 * Hook for checking user location against nearby sites.
 * Uses expo-location for GPS and calculates distance to determine
 * which sites the user is within allowable range of.
 */

import { useRequest } from "@/hooks/use-request";
import { getAttendanceSite } from "@/services/attendance";
import { IAttendanceSite } from "@/types";
import { getDistanceInMeters } from "@/utils/utils";
import { useEffect, useState } from "react";
import * as Location from "expo-location";
import { useToast } from "@/components/ui/toast";

export function useLocationCheck() {
  const { showToast } = useToast();
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [siteData, setSiteData] = useState<IAttendanceSite[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  const { run: getSite } = useRequest(() =>
    getAttendanceSite({ page: 1, per_page: 100 }),
  );

  // Request GPS permission and get current position
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          showToast("Izin lokasi diperlukan", "error");
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (mounted) setLocation(loc);
      } catch (e) {
        console.debug("Location error:", e);
      } finally {
        if (mounted) setLoadingLocation(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Fetch available sites
  useEffect(() => {
    const fetchSites = async () => {
      try {
        const res = await getSite();
        const sites = res.data?.data;
        setSiteData(sites || []);
      } catch (error) {
        console.error("Error fetching sites:", error);
        setSiteData([]);
      }
    };
    fetchSites();
  }, []);

  // Auto-detect nearby sites based on current location
  const nearbySites: IAttendanceSite[] = (() => {
    if (!siteData?.length || !location) return [];

    const lat = Number(location.coords.latitude);
    const lon = Number(location.coords.longitude);

    if (isNaN(lat) || isNaN(lon)) return [];

    return siteData.filter((s) => {
      return (
        getDistanceInMeters(lat, lon, s.latitude, s.longitude) <= s.tolerance
      );
    });
  })();

  const locationString = location
    ? `${location.coords.latitude}, ${location.coords.longitude}`
    : "Menunggu...";

  return {
    location,
    loadingLocation,
    siteData,
    nearbySites,
    selectedLocation,
    setSelectedLocation,
    locationString,
  };
}
