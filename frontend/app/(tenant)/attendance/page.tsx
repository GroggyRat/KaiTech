import dynamic from "next/dynamic";

const AttendanceClient = dynamic(
  () => import("@/components/attendance/AttendanceClient"),
  { ssr: false }
);

export default function AttendancePage() {
  return <AttendanceClient />;
}