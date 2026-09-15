/**
 * Mock Jest untuk `react-native-webview`.
 *
 * `react-native-webview` memanggil `TurboModuleRegistry.getEnforcing('RNCWebViewModule')`
 * saat modul di-import, yang melempar Invariant Violation di lingkungan Jest
 * (tidak ada binary native). Efeknya: SETIAP test yang meng-import komponen
 * yang memakai WebView — termasuk `AttendanceDetailModal.tsx` — gagal di
 * tahap import, bukan pada assertion.
 *
 * Mock ini menggantikan WebView dengan komponen tiruan yang aman, sehingga
 * logika React Native di sekitar peta tetap dapat diuji.
 */
import React from "react";

const MockWebView = React.forwardRef(function MockWebView(props, ref) {
  return React.createElement("WebView", { ...props, ref }, props.children);
});

MockWebView.displayName = "WebView";

export const WebView = MockWebView;
export const WebViewProps = {};
export default MockWebView;
