
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const Deconnexion = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("currentUser");
    localStorage.removeItem("user");
    // Purge tout token Bearer résiduel sur l'instance axios par défaut
    delete axios.defaults.headers.common["Authorization"];
    // Notifie l'app pour clear le state currentUser sans recharger la page
    window.dispatchEvent(new CustomEvent("auth:logout"));
    navigate("/login");
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Déconnexion</h1>
        <p className="text-muted-foreground">Se déconnecter du système.</p>
      </div>
      
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Déconnexion du Système</CardTitle>
          <CardDescription>Êtes-vous sûr de vouloir vous déconnecter?</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={handleLogout} className="bg-ynex-danger hover:bg-ynex-danger/90">
            <LogOut className="mr-2 h-4 w-4" />
            Déconnexion
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Deconnexion;
