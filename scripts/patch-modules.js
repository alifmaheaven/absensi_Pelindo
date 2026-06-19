const fs = require("fs");
const path = require("path");

// 1. Patch DOMRectReadOnly.js - replace private fields #x, #y, #width, #height with _ prefixed
const domRectPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native",
  "src",
  "private",
  "webapis",
  "geometry",
  "DOMRectReadOnly.js"
);

if (fs.existsSync(domRectPath)) {
  let content = fs.readFileSync(domRectPath, "utf8");
  const replacements = [
    ["#x", "_x"],
    ["#y", "_y"],
    ["#width", "_width"],
    ["#height", "_height"],
  ];
  let modified = false;
  for (const [from, to] of replacements) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      modified = true;
    }
  }
  if (modified) {
    fs.writeFileSync(domRectPath, content);
    console.log("✓ Patched DOMRectReadOnly.js - private fields → underscore");
  } else {
    console.log("→ DOMRectReadOnly.js already patched");
  }
} else {
  console.log("⚠ DOMRectReadOnly.js not found at", domRectPath);
}

// 2. Patch expo-modules-core Promise.kt - fix code: String? → String in toBridgePromise overrides
const promiseKtPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "expo-modules-core",
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "kotlin",
  "Promise.kt"
);

if (fs.existsSync(promiseKtPath)) {
  let content = fs.readFileSync(promiseKtPath, "utf8");

  // The issue: RN 0.83.6 Promise interface uses `code: String` (non-nullable) for all reject overloads
  // except the 4-param one. expo-modules-core toBridgePromise overrides use `code: String?` which
  // doesn't match. Fix by adding non-null overloads alongside nullable ones, or convert to non-null.
  //
  // Since RN Promise has `reject(code: String, message: String?)` etc,
  // we need to change the overrides from `code: String?` to `code: String`
  // for the 2- and 3-param variants.

  const overrideLines = [
    { from: "override fun reject(code: String?, message: String?)", to: "override fun reject(code: String, message: String?)" },
    { from: "override fun reject(code: String?, throwable: Throwable?)", to: "override fun reject(code: String, throwable: Throwable?)" },
    { from: "override fun reject(code: String?, message: String?, throwable: Throwable?)", to: "override fun reject(code: String, message: String?, throwable: Throwable?)" },
    { from: "override fun reject(code: String?, userInfo: WritableMap)", to: "override fun reject(code: String, userInfo: WritableMap)" },
    { from: "override fun reject(code: String?, throwable: Throwable?, userInfo: WritableMap)", to: "override fun reject(code: String, throwable: Throwable?, userInfo: WritableMap)" },
    { from: "override fun reject(code: String?, message: String?, userInfo: WritableMap)", to: "override fun reject(code: String, message: String?, userInfo: WritableMap)" },
  ];

  let modified = false;
  for (const { from, to } of overrideLines) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(promiseKtPath, content);
    console.log("✓ Patched Promise.kt - code: String? → String in overrides");
  } else {
    console.log("→ Promise.kt already patched or pattern not found");
  }
} else {
  console.log("⚠ Promise.kt not found at", promiseKtPath);
}
