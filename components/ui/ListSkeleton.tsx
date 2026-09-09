import React from "react";
import StandardSkeleton from "./StandardSkeleton";

export default function ListSkeleton({ count = 4 }: { count?: number }) {
  return <StandardSkeleton type="card-list" count={count} />;
}
