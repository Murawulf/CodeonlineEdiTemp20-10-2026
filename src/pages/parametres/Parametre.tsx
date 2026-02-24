
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const Parametre = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground">Configuration du système.</p>
      </div>
      
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Paramètres Système</CardTitle>
          <CardDescription>Configurez les paramètres de l'application</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notifications">Notifications</Label>
                <p className="text-sm text-muted-foreground">Recevoir des notifications système</p>
              </div>
              <Switch id="notifications" defaultChecked />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="emails">Emails</Label>
                <p className="text-sm text-muted-foreground">Recevoir des emails de notifications</p>
              </div>
              <Switch id="emails" defaultChecked />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="darkmode">Mode Sombre</Label>
                <p className="text-sm text-muted-foreground">Activer le thème sombre</p>
              </div>
              <Switch id="darkmode" />
            </div>
            
            <Button className="mt-4">Enregistrer les paramètres</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Parametre;
