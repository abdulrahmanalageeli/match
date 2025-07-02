import { Welcome } from "../welcome/welcome";
import { Button } from "../../components/ui/button";
import '../app.css';
import { Slot } from "@radix-ui/react-slot";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold">🚀 Origin UI is working!</h1>
        <Button variant="default">Default</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
      </div>
    </div>
  );
}
