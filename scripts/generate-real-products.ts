// Script pentru generarea produselor reale pentru toate categoriile
// Rulare: npx ts-node scripts/generate-real-products.ts

const realProducts = [
  // ==================== IMOBILIARE ====================
  {
    id: 'prod-1',
    title: 'Apartament 3 camere, renovat complet, Sector 1, București',
    description: 'Apartament spațios cu 3 camere, 2 băi, renovat complet în 2023. Etaj 5/10, orientare sud, balcon mare, vedere liberă. Zonă centrală, aproape de metrou și parcuri. Centrală proprie, parcare inclusă.',
    category: 'Imobiliare',
    subcategory: 'Apartamente',
    startingPrice: 185000,
    currency: 'RON',
    productType: 'details-only',
    status: 'active',
    saleType: 'vanzare-directa',
    county: 'București',
    city: 'București',
    address: 'Strada Primăverii 15, Sector 1, București',
    coordinates: { lat: 44.4268, lng: 26.1025 },
    images: [],
    customFields: {
      numarCamere: 3,
      numarDormitoare: 2,
      numarBai: 2,
      suprafata: 85,
      etaj: 5,
      totalEtaje: 10,
      anConstructie: 2015,
      centrala: 'Proprie',
      parcare: 'Da',
      balcon: 'Da'
    },
    seo: {
      title: 'Apartament 3 camere Sector 1 București - Renovat 2023',
      description: 'Apartament 3 camere renovat în Sector 1, București. Etaj 5/10, balcon mare, parcare inclusă. Zonă centrală.',
      keywords: ['apartament 3 camere', 'sector 1 bucurești', 'apartament renovat', 'vanzare apartament']
    },
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-2',
    title: 'Casă cu 4 camere, 2 etaje, grădină 800 mp, Ilfov',
    description: 'Casă modernă cu 4 camere, 2 etaje, garaj pentru 2 mașini, grădină amenajată de 800 mp. Construcție 2020, centrală pe gaze, sistem panouri solare, izolație termică excelentă.',
    category: 'Imobiliare',
    subcategory: 'Case și Vile',
    startingPrice: 420000,
    currency: 'RON',
    productType: 'details-only',
    status: 'active',
    saleType: 'vanzare-directa',
    county: 'Ilfov',
    city: 'Măgurele',
    address: 'Strada Aleea Privighetorilor 25, Măgurele, Ilfov',
    coordinates: { lat: 44.3500, lng: 26.0167 },
    images: [],
    customFields: {
      numarCamere: 4,
      numarDormitoare: 3,
      numarBai: 3,
      suprafata: 180,
      suprafataTeren: 800,
      anConstructie: 2020,
      centrala: 'Gaze',
      garaj: 'Da',
      gradina: 'Da'
    },
    seo: {
      title: 'Casă 4 camere Ilfov - Modernă 2020, Grădină 800 mp',
      description: 'Casă modernă cu 4 camere în Ilfov, construită 2020, grădină 800 mp, garaj dublu. Panouri solare, izolație excelentă.',
      keywords: ['casă ilfov', 'casă 4 camere', 'vanzare casă', 'casă modernă']
    },
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-3',
    title: 'Teren intravilan 500 mp, edificabil, Brașov',
    description: 'Teren intravilan edificabil, 500 mp, forma regulată, acces drum public. Situat în zona rezidențială Brașov, aproape de școli și centre comerciale. Documente în regulă, primăvarie disponibilă.',
    category: 'Imobiliare',
    subcategory: 'Terenuri Intravilane',
    startingPrice: 95000,
    currency: 'RON',
    productType: 'live-bid',
    status: 'active',
    saleType: 'licitatie-publica',
    auctionDate: '2024-03-15T10:00',
    county: 'Brașov',
    city: 'Brașov',
    address: 'Strada Măgurele 42, Brașov',
    coordinates: { lat: 45.6427, lng: 25.5887 },
    images: [],
    customFields: {
      suprafata: 500,
      tipTeren: 'Intravilan',
      categorieFolosinta: 'Edificabil',
      formaTeren: 'Regulată',
      accesDrum: 'Da'
    },
    seo: {
      title: 'Teren Intravilan Brașov 500 mp - Edificabil',
      description: 'Teren intravilan edificabil 500 mp în Brașov, forma regulată, acces drum public. Locație excelentă.',
      keywords: ['teren brașov', 'teren intravilan', 'teren edificabil', 'vanzare teren']
    },
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-4',
    title: 'Teren agricol 5 hectare, cu apă, Dolj',
    description: 'Teren agricol de 5 hectare, categoria II, cu sursă de apă proprie. Sol fertil, acces ușor, situat la ieșirea din sat. Ideal pentru culturi sau pășuni.',
    category: 'Imobiliare',
    subcategory: 'Terenuri Agricole',
    startingPrice: 45000,
    currency: 'RON',
    productType: 'details-only',
    status: 'active',
    saleType: 'vanzare-directa',
    county: 'Dolj',
    city: 'Craiova',
    address: 'Comuna Bratovoești, Dolj',
    coordinates: { lat: 44.3302, lng: 23.7949 },
    images: [],
    customFields: {
      suprafata: 50000,
      tipTeren: 'Extravilan',
      categorieFolosinta: 'Agricol',
      sursaApa: 'Da',
      categorieSol: 'II'
    },
    seo: {
      title: 'Teren Agricol Dolj 5 ha - Cu Apă, Sol Fertil',
      description: 'Teren agricol 5 hectare în Dolj, categoria II, cu sursă de apă proprie. Sol fertil, ideal pentru culturi.',
      keywords: ['teren agricol', 'teren dolj', 'teren hectare', 'teren cu apă']
    },
    createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-5',
    title: 'Spațiu comercial 120 mp, centru oraș, Cluj',
    description: 'Spațiu comercial 120 mp, parter, situat în centrul orașului Cluj-Napoca. Locație excelentă pentru comerț sau servicii. Vitrine mari, acces facil, centrală proprie.',
    category: 'Imobiliare',
    subcategory: 'Spații Comerciale',
    startingPrice: 320000,
    currency: 'RON',
    productType: 'live-bid',
    status: 'active',
    saleType: 'licitatie-publica',
    auctionDate: '2024-03-20T14:00',
    county: 'Cluj',
    city: 'Cluj-Napoca',
    address: 'Strada Memorandumului 28, Cluj-Napoca',
    coordinates: { lat: 46.7712, lng: 23.6236 },
    images: [],
    customFields: {
      suprafata: 120,
      tipSpatiu: 'Comercial',
      etaj: 0,
      vitrine: 'Da',
      centrala: 'Proprie'
    },
    seo: {
      title: 'Spațiu Comercial Cluj 120 mp - Centru Oraș',
      description: 'Spațiu comercial 120 mp în centrul Cluj-Napoca, parter, vitrine mari. Locație premium pentru comerț.',
      keywords: ['spațiu comercial', 'cluj', 'locație comercială', 'vanzare spațiu']
    },
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-6',
    title: 'Hală industrială 800 mp, șine, Timiș',
    description: 'Hală industrială modernă, 800 mp, înălțime 8m, cu șine pod rulant, birouri anexă 100 mp. Construcție 2018, instalații complete, parcare exterioară. Ideal pentru producție sau depozitare.',
    category: 'Imobiliare',
    subcategory: 'Hale Industriale',
    startingPrice: 650000,
    currency: 'RON',
    productType: 'details-only',
    status: 'active',
    saleType: 'vanzare-directa',
    county: 'Timiș',
    city: 'Timișoara',
    address: 'Bd. Iuliu Maniu 1, Timișoara',
    coordinates: { lat: 45.7489, lng: 21.2087 },
    images: [],
    customFields: {
      suprafata: 800,
      tipConstructie: 'Hangar industrial',
      inaltime: 8,
      sinePod: 'Da',
      suprafataBirouri: 100,
      anConstructie: 2018
    },
    seo: {
      title: 'Hală Industrială Timiș 800 mp - Șine Pod Rulant',
      description: 'Hală industrială 800 mp în Timișoara, înălțime 8m, cu șine pod rulant. Construcție 2018, instalații complete.',
      keywords: ['hală industrială', 'timișoara', 'hală depozitare', 'hală producție']
    },
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-7',
    title: 'Vilă turistică 5 camere, Marea Neagră, Constanța',
    description: 'Vilă turistică cu 5 camere, 3 băi, terasă mare, la 200m de plajă. Amenajată pentru turism, mobilier complet, sistem aer condiționat. Sezon lung, rentabilitate excelentă.',
    category: 'Imobiliare',
    subcategory: 'Proprietăți Turistice',
    startingPrice: 280000,
    currency: 'RON',
    productType: 'live-bid',
    status: 'active',
    saleType: 'licitatie-publica',
    auctionDate: '2024-03-18T11:00',
    county: 'Constanța',
    city: 'Mamaia',
    address: 'Bd. Mamaia 100, Mamaia, Constanța',
    coordinates: { lat: 44.2500, lng: 28.6167 },
    images: [],
    customFields: {
      numarCamere: 5,
      numarBai: 3,
      suprafata: 150,
      distantaPlaja: 200,
      mobilier: 'Complet',
      aerConditionat: 'Da',
      terasa: 'Da'
    },
    seo: {
      title: 'Vilă Turistică Mamaia - La 200m de Plajă',
      description: 'Vilă turistică 5 camere în Mamaia, la 200m de plajă. Mobilier complet, sistem AC, rentabilitate excelentă.',
      keywords: ['vilă turistică', 'mamaia', 'proprietate turistică', 'vanzare vilă']
    },
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
  },

  // ==================== EXECUTĂRI SILITE ====================
  {
    id: 'prod-8',
    title: 'Apartament executare silită, 2 camere, București',
    description: 'Apartament de 2 camere, executare silită prin instanță. Etaj 3/5, balcon, renovat parțial. Documente în curs de finalizare, preț sub piață.',
    category: 'Executări Silite',
    subcategory: 'Imobile (Executări)',
    startingPrice: 125000,
    currency: 'RON',
    productType: 'live-bid',
    status: 'active',
    saleType: 'licitatie-publica',
    auctionDate: '2024-03-12T10:00',
    county: 'București',
    city: 'București',
    address: 'Strada Mircea Eliade 45, Sector 6, București',
    coordinates: { lat: 44.4322, lng: 26.0708 },
    images: [],
    customFields: {
      numarCamere: 2,
      numarDormitoare: 1,
      numarBai: 1,
      suprafata: 58,
      etaj: 3,
      totalEtaje: 5,
      tipExecutare: 'ANAF',
      stareDocumente: 'În curs de finalizare'
    },
    seo: {
      title: 'Apartament Executare Silită București - 2 Camere',
      description: 'Apartament 2 camere executare silită în București, preț sub piață. Documente în finalizare, locație centrală.',
      keywords: ['executare silită', 'apartament bucurești', 'licitație executare', 'apartament ieftin']
    },
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-9',
    title: 'Teren executare silită, 300 mp, Cluj',
    description: 'Teren intravilan edificabil, executare silită prin instanță. 300 mp, forma regulată, acces drum public. Documente complete, transfer imediat.',
    category: 'Executări Silite',
    subcategory: 'Terenuri (Executări)',
    startingPrice: 55000,
    currency: 'RON',
    productType: 'live-bid',
    status: 'active',
    saleType: 'licitatie-publica',
    auctionDate: '2024-03-14T13:00',
    county: 'Cluj',
    city: 'Cluj-Napoca',
    address: 'Strada Barițiu 12, Cluj-Napoca',
    coordinates: { lat: 46.7712, lng: 23.6236 },
    images: [],
    customFields: {
      suprafata: 300,
      tipTeren: 'Intravilan',
      categorieFolosinta: 'Edificabil',
      tipExecutare: 'Judecătorie',
      stareDocumente: 'Complete'
    },
    seo: {
      title: 'Teren Executare Silită Cluj 300 mp - Edificabil',
      description: 'Teren intravilan 300 mp executare silită în Cluj, edificabil, documente complete. Preț avantajos.',
      keywords: ['teren executare', 'cluj', 'teren edificabil', 'licitație teren']
    },
    createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-10',
    title: 'Audi A4 2018, executare silită, 125000 km',
    description: 'Audi A4 2.0 TDI, an 2018, 125000 km reali, cutie automată, full option. Executare silită, preț sub piață. Istoric service complet.',
    category: 'Executări Silite',
    subcategory: 'Mașini (Executări)',
    startingPrice: 18500,
    currency: 'RON',
    productType: 'live-bid',
    status: 'active',
    saleType: 'licitatie-publica',
    auctionDate: '2024-03-11T09:00',
    county: 'Ilfov',
    city: 'București',
    images: [],
    customFields: {
      marca: 'Audi',
      model: 'A4',
      an: 2018,
      km: 125000,
      combustibil: 'Motorină',
      cutieViteze: 'Automată',
      putere: 150,
      tipExecutare: 'Bancă'
    },
    seo: {
      title: 'Audi A4 2018 Executare Silită - Full Option',
      description: 'Audi A4 2018 executare silită, 125000 km, cutie automată, full option. Preț sub piață, istoric service complet.',
      keywords: ['audi a4', 'executare silită', 'mașină executare', 'audi second hand']
    },
    createdAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-11',
    title: 'Excavator JCB 3CX, executare silită, an 2015',
    description: 'Excavator JCB 3CX, an 2015, 4500 ore motor, stare bună, ultim service 2023. Executare silită prin instanță, documente complete.',
    category: 'Executări Silite',
    subcategory: 'Utilaje (Executări)',
    startingPrice: 85000,
    currency: 'RON',
    productType: 'live-bid',
    status: 'active',
    saleType: 'licitatie-publica',
    auctionDate: '2024-03-16T10:00',
    county: 'Prahova',
    city: 'Ploiești',
    images: [],
    customFields: {
      marca: 'JCB',
      model: '3CX',
      an: 2015,
      oreMotor: 4500,
      tipUtilaj: 'Excavator',
      stareTehnica: 'Bună',
      tipExecutare: 'Furnizor'
    },
    seo: {
      title: 'Excavator JCB 3CX Executare Silită - 4500 Ore',
      description: 'Excavator JCB 3CX an 2015, executare silită, 4500 ore motor. Stare bună, service recent, preț avantajos.',
      keywords: ['excavator jcb', 'utilaj executare', 'jcb 3cx', 'excavator second hand']
    },
    createdAt: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000).toISOString()
  },

  // ==================== AUTOVEHICULE ====================
  {
    id: 'prod-12',
    title: 'Volkswagen Golf 8, 1.5 TSI, 2022, 45000 km',
    description: 'Volkswagen Golf 8, 1.5 TSI 150CP, an 2022, 45000 km reali, cutie manuală 6 trepte. Full option: clima, senzori, camera spate, cruise control.',
    category: 'Autovehicule',
    subcategory: 'Autoturisme',
    startingPrice: 28500,
    currency: 'RON',
    productType: 'details-only',
    status: 'active',
    saleType: 'vanzare-directa',
    county: 'București',
    city: 'București',
    images: [],
    customFields: {
      marca: 'Volkswagen',
      model: 'Golf 8',
      an: 2022,
      km: 45000,
      combustibil: 'Benzină',
      cutieViteze: 'Manuală',
      putere: 150,
      caroserie: 'Hatchback'
    },
    seo: {
      title: 'Volkswagen Golf 8 2022 - 45000 km, Full Option',
      description: 'Volkswagen Golf 8, 1.5 TSI 150CP, an 2022, 45000 km. Full option: clima, senzori, camera spate.',
      keywords: ['volkswagen golf', 'golf 8', 'masina second hand', 'vw golf']
    },
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-13',
    title: 'Dacia Duster 2021, 1.5 dCi, 4x4, 85000 km',
    description: 'Dacia Duster 1.5 dCi 115CP, an 2021, 85000 km reali, cutie manuală 6 trepte, tracțiune integrală 4x4. 5 locuri, clima, senzori parcare.',
    category: 'Autovehicule',
    subcategory: 'SUV / 4x4',
    startingPrice: 28500,
    currency: 'RON',
    productType: 'live-bid',
    status: 'active',
    saleType: 'licitatie-publica',
    auctionDate: '2024-03-17T15:00',
    county: 'Cluj',
    city: 'Cluj-Napoca',
    images: [],
    customFields: {
      marca: 'Dacia',
      model: 'Duster',
      an: 2021,
      km: 85000,
      combustibil: 'Motorină',
      cutieViteze: 'Manuală',
      putere: 115,
      tracțiune: '4x4'
    },
    seo: {
      title: 'Dacia Duster 2021 4x4 - 85000 km, Diesel',
      description: 'Dacia Duster 2021, 1.5 dCi 115CP, 85000 km, tracțiune 4x4. Cutie manuală, senzori parcare.',
      keywords: ['dacia duster', 'duster 4x4', 'suv dacia', 'duster second hand']
    },
    createdAt: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-14',
    title: 'Yamaha MT-07, 2020, 12000 km, ABS',
    description: 'Yamaha MT-07, an 2020, 12000 km reali, ABS, sistem tracțiune, două culori disponibile. Stare excelentă, service autorizat, carte service completă.',
    category: 'Autovehicule',
    subcategory: 'Motociclete și Scutere',
    startingPrice: 12500,
    currency: 'RON',
    productType: 'details-only',
    status: 'active',
    saleType: 'vanzare-directa',
    county: 'Brașov',
    city: 'Brașov',
    images: [],
    customFields: {
      marca: 'Yamaha',
      model: 'MT-07',
      an: 2020,
      km: 12000,
      cilindree: 689,
      putere: 74,
      abs: 'Da',
      tip: 'Naked'
    },
    seo: {
      title: 'Yamaha MT-07 2020 - 12000 km, ABS',
      description: 'Yamaha MT-07 an 2020, 12000 km, ABS, sistem tracțiune. Stare excelentă, service autorizat.',
      keywords: ['yamaha mt-07', 'motocicletă yamaha', 'mt-07 second hand', 'naked bike']
    },
    createdAt: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-15',
    title: 'IVECO Daily 35S15, 2019, 95000 km, 3.5t',
    description: 'IVECO Daily 35S15, an 2019, 95000 km reali, capacitate 3.5 tone, cutie manuală 6 trepte. Ideal pentru transport mărfuri, stare excelentă.',
    category: 'Autovehicule',
    subcategory: 'Camioane',
    startingPrice: 42000,
    currency: 'RON',
    productType: 'live-bid',
    status: 'active',
    saleType: 'licitatie-publica',
    auctionDate: '2024-03-19T10:00',
    county: 'Constanța',
    city: 'Constanța',
    images: [],
    customFields: {
      marca: 'IVECO',
      model: 'Daily 35S15',
      an: 2019,
      km: 95000,
      capacitate: 3.5,
      tipCaroserie: 'Cutie',
      cutieViteze: 'Manuală'
    },
    seo: {
      title: 'IVECO Daily 35S15 2019 - 95000 km, 3.5t',
      description: 'IVECO Daily 35S15 an 2019, 95000 km, capacitate 3.5 tone. Ideal pentru transport, stare excelentă.',
      keywords: ['iveco daily', 'camion iveco', 'daily second hand', 'transport mărfuri']
    },
    createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-16',
    title: 'Remorcă platformă 3.5t, cu ramă, an 2020',
    description: 'Remorcă platformă pentru transport, capacitate 3.5 tone, cu ramă hidraulică. Șase tone, an 2020, stare foarte bună, ITP valabil.',
    category: 'Autovehicule',
    subcategory: 'Remorci și Semiremorci',
    startingPrice: 8500,
    currency: 'RON',
    productType: 'details-only',
    status: 'active',
    saleType: 'vanzare-directa',
    county: 'Dolj',
    city: 'Craiova',
    images: [],
    customFields: {
      tipRemorca: 'Platformă',
      capacitate: 3.5,
      an: 2020,
      rama: 'Hidraulică',
      lungime: 6,
      latime: 2.5
    },
    seo: {
      title: 'Remorcă Platformă 3.5t - Cu Ramă Hidraulică',
      description: 'Remorcă platformă 3.5 tone cu ramă hidraulică, an 2020. Stare foarte bună, ITP valabil.',
      keywords: ['remorcă platformă', 'remorcă transport', 'remorcă 3.5t', 'ramă hidraulică']
    },
    createdAt: new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-17',
    title: 'Autorulotă Adria Compact, 4 locuri, 2021',
    description: 'Autorulotă Adria Compact, 4 locuri de dormit, an 2021. Tot echipată: baie completă, bucătărie, sistem electric. Stare nouă, folosită sezon.',
    category: 'Autovehicule',
    subcategory: 'Autorulote / Rulote',
    startingPrice: 18500,
    currency: 'RON',
    productType: 'live-bid',
    status: 'active',
    saleType: 'licitatie-publica',
    auctionDate: '2024-03-13T11:00',
    county: 'Sibiu',
    city: 'Sibiu',
    images: [],
    customFields: {
      marca: 'Adria',
      model: 'Compact',
      an: 2021,
      locuri: 4,
      lungime: 5.5,
      baie: 'Completă',
      bucatarie: 'Da'
    },
    seo: {
      title: 'Autorulotă Adria Compact 2021 - 4 Locuri',
      description: 'Autorulotă Adria Compact an 2021, 4 locuri, baie completă, bucătărie. Tot echipată, stare nouă.',
      keywords: ['autorulotă', 'adria compact', 'rulotă', 'autorulotă second hand']
    },
    createdAt: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-18',
    title: 'Tesla Model 3, 2023, 15000 km, Full Autopilot',
    description: 'Tesla Model 3 Standard Range Plus, an 2023, 15000 km reali, Full Self-Driving package. Baterie 100%, garanție activă, stare perfectă.',
    category: 'Autovehicule',
    subcategory: 'Vehicule Electrice',
    startingPrice: 125000,
    currency: 'RON',
    productType: 'details-only',
    status: 'active',
    saleType: 'vanzare-directa',
    county: 'București',
    city: 'București',
    images: [],
    customFields: {
      marca: 'Tesla',
      model: 'Model 3',
      an: 2023,
      km: 15000,
      tip: 'Electric',
      autonomie: 400,
      incarcare: 'Supercharger'
    },
    seo: {
      title: 'Tesla Model 3 2023 - Full Autopilot, 15000 km',
      description: 'Tesla Model 3 an 2023, 15000 km, Full Self-Driving package. Baterie 100%, garanție activă.',
      keywords: ['tesla model 3', 'tesla electric', 'tesla second hand', 'vehicul electric']
    },
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'prod-19',
    title: 'Set jante aluminiu 18" BMW, 5 bucăți',
    description: 'Set complet jante aluminiu original BMW, 18 inch, 5 bucăți cu anvelope. Stare foarte bună, fără deteriorări, echilibrare completă.',
    category: 'Autovehicule',
    subcategory: 'Piese Auto și Accesorii',
    startingPrice: 2200,
    currency: 'RON',
    productType: 'details-only',
    status: 'active',
    saleType: 'vanzare-directa',
    county: 'Ilfov',
    city: 'București',
    images: [],
    customFields: {
      tipProdus: 'Jante',
      marca: 'BMW',
      diametru: 18,
      numar: 5,
      anvelope: 'Da',
      stare: 'Foarte bună'
    },
    seo: {
      title: 'Jante BMW 18" - Set 5 Bucăți cu Anvelope',
      description: 'Set complet jante aluminiu BMW 18 inch, 5 bucăți cu anvelope. Originale, stare foarte bună.',
      keywords: ['jante bmw', 'jante 18', 'piese bmw', 'jante aluminiu']
    },
    createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
  },

  // Continuare cu celelalte categorii...
  // Voi genera produse pentru toate categoriile rămase
];

// Salvare în localStorage (pentru browser)
if (typeof window !== 'undefined') {
  localStorage.setItem('products', JSON.stringify(realProducts));
  console.log(`✅ ${realProducts.length} produse reale au fost salvate în localStorage`);
} else {
  // Pentru Node.js (script)
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(process.cwd(), 'data', 'real-products.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(realProducts, null, 2));
  console.log(`✅ ${realProducts.length} produse reale au fost salvate în ${filePath}`);
}

export { realProducts };

















