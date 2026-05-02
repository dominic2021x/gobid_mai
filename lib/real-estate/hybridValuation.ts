/**
 * Hybrid Valuation Model - Calculează valoarea reală bazată pe teren + construcție + depreciere
 */

import { ExtractedCriteria } from './aiExtractor';

export interface HybridValuationResult {
  terrain_value: number;
  construction_value: number;
  total_value: number;
  depreciation_applied: number;
  terrain_coefficient: number;
}

/**
 * Calculează valoarea terenului
 */
function calculateTerrainValue(
  landArea: number,
  zone: string,
  city: string,
  terrainCoefficient: number = 0.35
): number {
  // Prețuri teren/mp bazate pe zonă și oraș (EUR/mp)
  const zonePrices: Record<string, Record<string, number>> = {
    'bucurești': {
      'militari': 150,
      'băneasa': 200,
      'dorobanți': 250,
      'centru': 300,
      'default': 120,
    },
    'cluj': {
      'centru': 180,
      'gheorgheni': 120,
      'default': 100,
    },
    'breaza': {
      'default': 15, // Oraș mic, prețuri mici
    },
    'târgoviște': {
      'default': 12, // Oraș mic, prețuri mici pentru Târgoviște
    },
    'targoviste': {
      'default': 12, // Oraș mic, prețuri mici pentru Târgoviște
    },
    'default': {
      'default': 20,
    },
  };

  const cityLower = (city || '').toLowerCase();
  const zoneLower = (zone || '').toLowerCase();
  
  const cityPrices = zonePrices[cityLower] || zonePrices['default'];
  const zonePrice = cityPrices[zoneLower] || cityPrices['default'] || 20;

  // IMPORTANT: Returnează valoarea TOTALĂ a terenului (nu pe mp)
  return landArea * zonePrice * terrainCoefficient;
}

/**
 * Calculează valoarea construcției cu depreciere
 */
function calculateConstructionValue(
  usableArea: number,
  year?: number,
  isOldHouse: boolean = false,
  hasRenovations: boolean = false
): { value: number; depreciation: number; baseCost: number } {
  // Cost de bază pe mp (EUR/mp)
  let baseCost = 600; // Default pentru construcție nouă
  
  if (isOldHouse) {
    baseCost = 500; // Cost redus pentru case vechi
  }

  // Calculează deprecierea
  let depreciation = 0;
  
  if (isOldHouse && !hasRenovations) {
    // Casă veche fără renovări: depreciere 60-80%
    depreciation = 0.70; // 70% depreciere
  } else if (year) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    
    if (age > 50) {
      depreciation = 0.60; // 60% pentru case foarte vechi
    } else if (age > 30) {
      depreciation = 0.50; // 50% pentru case vechi
    } else if (age > 20) {
      depreciation = 0.40; // 40% pentru case mijlocii
    } else if (age > 10) {
      depreciation = 0.25; // 25% pentru case relativ noi
    } else {
      depreciation = 0.10; // 10% pentru case noi
    }
  }

  // Ajustare pentru renovări
  if (hasRenovations) {
    depreciation *= 0.5; // Reducere depreciere cu 50% dacă are renovări
  }

  const constructionValue = usableArea * baseCost * (1 - depreciation);

  return {
    value: constructionValue,
    depreciation,
    baseCost,
  };
}

/**
 * Calculează valoarea hibridă (teren + construcție)
 */
export function calculateHybridValuation(
  extracted: ExtractedCriteria
): HybridValuationResult {
  const { tip, criterii } = extracted;
  // Pentru terenuri, folosim suprafata_teren, dar dacă nu există, folosim suprafata
  const isLandOnly = tip === 'teren_intravilan' || tip === 'teren_agricol';
  const landArea = isLandOnly ? 
    (criterii.suprafata_teren || criterii.suprafata || 0) :
    (criterii.suprafata_teren || 0);
  const usableArea = criterii.suprafata || 0;
  const year = criterii.an || criterii.an_constructie;
  const isOldHouse = criterii.categorie_speciala === 'casă veche' || 
                     (!year && !criterii.stare?.includes('nou') && !criterii.stare?.includes('renovat'));
  const hasRenovations = criterii.stare?.includes('renovat') || 
                         criterii.stare?.includes('renovație') ||
                         false;

  // Coeficient teren bazat pe tip proprietate
  let terrainCoefficient = 1.0; // Default pentru terenuri pure
  
  if (isLandOnly) {
    // Pentru terenuri pure, coeficientul este 1.0 (nu se aplică reducerea pentru micro-terenuri cu case)
    terrainCoefficient = 1.0;
  } else if (criterii.categorie_speciala === 'micro-teren' || landArea < 150) {
    // Micro-teren: coeficient redus (0.30 - 0.45)
    terrainCoefficient = 0.30 + (landArea / 150) * 0.15; // Interpolare între 0.30 și 0.45
  } else {
    terrainCoefficient = 0.35; // Default pentru case cu teren
  }

  // Calculează valoarea terenului
  const terrainValue = calculateTerrainValue(
    landArea,
    criterii.zona || '',
    criterii.oras || '',
    terrainCoefficient
  );

  // Calculează valoarea construcției (doar dacă nu este doar teren)
  let constructionValue = 0;
  let depreciation = 0;
  
  if (!isLandOnly && usableArea > 0) {
    const construction = calculateConstructionValue(
      usableArea,
      year,
      isOldHouse,
      hasRenovations
    );
    constructionValue = construction.value;
    depreciation = construction.depreciation;
  }

  const totalValue = terrainValue + constructionValue;

  return {
    terrain_value: terrainValue,
    construction_value: constructionValue,
    total_value: totalValue,
    depreciation_applied: depreciation,
    terrain_coefficient: terrainCoefficient,
  };
}

