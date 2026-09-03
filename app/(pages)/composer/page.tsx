import type { Metadata } from "next";
import { Composer } from "@/components/composer";

export const metadata: Metadata = {
  title: "Composer · Social Scheduler",
};

export default function ComposerPage() {
  return <Composer />;
}
