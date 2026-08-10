import type { Metadata } from "next";
import { TodayRouter } from "@/components/screens/today-router";

export const metadata: Metadata = {
  title: "Today · Humanoid",
};

export default function TodayPage() {
  return <TodayRouter />;
}
