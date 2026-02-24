import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { motion } from "framer-motion";

const Trafic: React.FC = () => {
  const text = "Interactions du réseau PAESN".split(""); // Animated text

  return (
    <div className="space-y-6">
      {/* Breadcrumb / Header */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center space-x-2 text-sm text-muted-foreground">
          <span className="font-medium text-[#1c74e9]">Trafic</span>
        </nav>
      </div>

      {/* Main Card */}
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Trafic</CardTitle>
          <CardDescription>
            Suivi des échanges entre le Data Pool Sénégal et les plateformes externes locales ou internationales
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center border rounded border-dashed">
            <div className="flex space-x-1">
              {text.map((letter, i) => (
                <motion.span
                  key={i}
                  className="text-green-600 font-extrabold text-5xl"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1] }}
                  transition={{
                    duration: 0.6,
                    delay: i * 0.2, // slightly faster animation
                    repeat: Infinity,
                    repeatDelay: text.length * 0.2 + 1,
                  }}
                >
                  {letter}
                </motion.span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Trafic;
