import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { motion } from "framer-motion";

const Operations: React.FC = () => {
  const text = "Service    ultérieur ( Phase 3 )".split("");

  return (
    <div className="min-h-screen">
      <nav className="flex items-center space-x-2 text-sm">
        <span style={{ color: '#3b82f6', position: 'relative', top: '-14px', fontWeight: '500' }}>
          Opérations
        </span>
      </nav>
      <div className="space-y-6 p-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Opérations d'appels d'offres</CardTitle>
            <CardDescription>Suivez et gérez vos appels d'offres</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center justify-center border rounded border-dashed">
              <div className="flex space-x-1">
                {text.map((letter, i) => (
                  <motion.span
                    key={i}
                    className="text-sky-600 font-extrabold text-5xl"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 1] }}
                    transition={{
                      duration: 0.6,
                      delay: i * 0.3,
                      repeat: Infinity,
                      repeatDelay: text.length * 0.3 + 1,
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
    </div>
  );
};

export default Operations;