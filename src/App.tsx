import Timeline from "./components/Timeline";
import FieldCanvas from "./components/FieldCanvas";

export default function App() {
  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      <div className="flex-1 min-h-0 border-b border-zinc-700">
        <FieldCanvas />
      </div>
      <div className="flex-1 min-h-0">
        <Timeline />
      </div>
    </div>
  );
}
