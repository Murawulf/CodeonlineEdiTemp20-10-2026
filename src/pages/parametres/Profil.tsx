
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Profil = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profil</h1>
        <p className="text-muted-foreground">Gérez vos informations personnelles.</p>
      </div>
      
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Informations du Profil</CardTitle>
          <CardDescription>Modifiez vos informations personnelles</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nom</Label>
                <Input id="name" placeholder="Votre nom" defaultValue="Utilisateur Admin" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="Votre email" defaultValue="admin@example.com" />
              </div>
            </div>
            <Button>Enregistrer les modifications</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Profil;
