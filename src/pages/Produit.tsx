import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import Mapping from './Mapping';
import { nmcData } from '../pages/nmcCodes';
import { useLocalApiUrl } from '../contexts/SettingsContext';

const Produit = () => {
  const API_BASE_URL = useLocalApiUrl();

  // ── Bricks from DB (for analytics totals) ─────────────────────────────────
  const [totalBricks, setTotalBricks] = useState(0);
  const totalNmcCodes = nmcData.length;

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/bricks`)
      .then(r => r.json())
      .then(data => setTotalBricks(data.length))
      .catch(() => {});
  }, [API_BASE_URL]);

  // ── Analytics state ────────────────────────────────────────────────────────
  const [mappingProgress, setMappingProgress] = useState(0);
  const [mappedCount, setMappedCount] = useState(0);
  const [rayonData, setRayonData] = useState([
    { name: 'Mappé', value: 0, color: '#3b82f6' },
    { name: 'Non Mappé', value: 0, color: '#f97316' },
  ]);
  const [brickMappingData, setBrickMappingData] = useState([
    { name: '0 Rayons', value: 0, color: '#f97316' },
    { name: '1 Rayon',  value: 0, color: '#3b82f6' },
    { name: '2 Rayons', value: 0, color: '#10b981' },
    { name: '3+ Rayons', value: 0, color: '#8b5cf6' },
  ]);

  // ── Callbacks fed into Mapping for live analytics updates ─────────────────
  const handleProgressUpdate = useCallback((mapped: number, total: number) => {
    const t = total || totalBricks || 1;
    setMappedCount(mapped);
    setMappingProgress(Math.round((mapped / t) * 100));
  }, [totalBricks]);

  const handleNmcUpdate = useCallback((mappedNmc: number, totalNmc: number) => {
    const t = totalNmc || totalNmcCodes || 1;
    setRayonData([
      { name: 'Mappé',     value: mappedNmc,     color: '#3b82f6' },
      { name: 'Non Mappé', value: t - mappedNmc, color: '#f97316' },
    ]);
  }, [totalNmcCodes]);

  const handleSelectionsChange = useCallback((selections: Record<string, any[]>, total: number) => {
    const t = total || totalBricks || 1;
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    Object.values(selections).forEach((sels: any[]) => {
      const n = sels.length;
      if (n >= 3) counts[3]++;
      else counts[n]++;
    });
    counts[0] = Math.max(0, t - counts[1] - counts[2] - counts[3]);
    setBrickMappingData([
      { name: '0 Rayons',  value: counts[0], color: '#f97316' },
      { name: '1 Rayon',   value: counts[1], color: '#3b82f6' },
      { name: '2 Rayons',  value: counts[2], color: '#10b981' },
      { name: '3+ Rayons', value: counts[3], color: '#8b5cf6' },
    ]);
  }, [totalBricks]);

  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm font-medium text-blue-600 px-6 pt-3 pb-2 mb-1">
        <span className="text-blue-600 font-medium">Produits</span>
        <span className="text-gray-300">›</span>
        <span className="text-blue-600 font-medium">Mapping Bricks-Rayon</span>
      </nav>

      <div className="flex flex-col gap-4 px-4 py-4 sm:px-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Mapping Bricks / Rayons</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Classification GPC avec Rayons de la Distribution
          </p>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* ── Mapping panel (2/3 width on large screens) ── */}
        <div className="lg:col-span-2">
          <Card className="shadow-sm h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900">
                Affectations Brick / Rayons
              </CardTitle>
              <CardDescription className="text-sm text-gray-500">
                Associez une brick à un ou plusieurs rayons (NMC)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3">
              <Mapping
                apiBaseUrl={API_BASE_URL}
                onProgressUpdate={handleProgressUpdate}
                onNmcUpdate={handleNmcUpdate}
                onSelectionsChange={handleSelectionsChange}
              />
            </CardContent>
          </Card>
        </div>

        {/* ── Analytics panel (1/3 width) ── */}
        <div className="lg:col-span-1 flex flex-col gap-4">

          {/* Progress card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900">Progression</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Bricks mappés</span>
                <span className="font-semibold">{mappingProgress}%</span>
              </div>
              <Progress value={mappingProgress} className="h-2" />
              <p className="text-xs text-gray-400 mt-1">
                {mappedCount} / {totalBricks || '…'} bricks
              </p>
            </CardContent>
          </Card>

          {/* Rayon distribution */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900">Rayons Mappés</CardTitle>
              <CardDescription className="text-xs text-gray-400">
                Codes NMC utilisés vs disponibles
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={rayonData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    label={({ percent }: { percent: number }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {rayonData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Legend verticalAlign="bottom" height={28} iconSize={10} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Brick distribution */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-900">Distribution Bricks</CardTitle>
              <CardDescription className="text-xs text-gray-400">
                Par nombre de rayons associés
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 pt-0">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={brickMappingData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    label={({ percent }: { percent: number }) => percent > 0 ? `${(percent * 100).toFixed(0)}%` : ''}
                  >
                    {brickMappingData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Legend verticalAlign="bottom" height={28} iconSize={10} />
                </PieChart>
              </ResponsiveContainer>

              {/* Mini breakdown list */}
              <div className="mt-2 grid grid-cols-2 gap-1">
                {brickMappingData.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span>{d.name}:</span>
                    <span className="font-semibold ml-auto">{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Produit;
