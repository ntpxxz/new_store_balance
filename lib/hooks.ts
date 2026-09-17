"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "./client";

export function useAuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useSearchRef(initial = "") {
  const [search, setSearch] = useState(initial);
  const ref = useRef(initial);
  ref.current = search;
  return [search, setSearch, ref] as const;
}
