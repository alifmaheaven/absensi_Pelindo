/**
 * Mock Jest untuk `expo-blur`.
 *
 * BlurView memakai view native yang tidak ada di lingkungan Jest. Mock ini
 * merender View biasa supaya komponen yang memakai GlassSurface tetap dapat diuji.
 */
import React from "react";
import { View } from "react-native";

export const BlurView = ({ children, ...props }) =>
  React.createElement(View, props, children);

export const BlurTargetView = ({ children, ...props }) =>
  React.createElement(View, props, children);
