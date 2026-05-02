/**
 * Modele per brand pentru telefoane și autovehicule.
 * Lista de branduri auto = după autodata24 / mobile.ro (toate mărcile disponibile în România).
 * Folosit în secțiunea principală la adăugare anunț (select Model, Capacitate cilindrică).
 */

// ========== TOATE BRANDURILE AUTO (după autodata24 / mobile.ro) ==========
export const CAR_BRANDS_FULL: readonly string[] = [
  'Acura', 'Alfa Romeo', 'Alpina', 'Alpine', 'Aro', 'Asia', 'Aston Martin', 'Audi', 'Austin', 'Autobianchi',
  'Baltijas Dzips', 'Beijing', 'Bentley', 'Bertone', 'Bitter', 'Blonell', 'BMW', 'Brilliance', 'Bristol', 'Bufori',
  'Bugatti', 'Buick', 'BYD', 'Cadillac', 'Callaway', 'Carbodies', 'Caterham', 'ChangAn', 'ChangFeng', 'Chery',
  'Chevrolet', 'Chrysler', 'Citroen', 'Cizeta', 'Coggiola', 'Dacia', 'Dadi', 'Daewoo', 'DAF', 'Daihatsu',
  'Daimler', 'Dallas', 'De Lorean', 'De Tomaso', 'Derways', 'Dodge', 'DongFeng', 'Doninvest', 'Donkervoort',
  'Eagle', 'FAW', 'Ferrari', 'Fiat', 'Ford', 'FSO', 'Fuqi', 'GAZ', 'Geely', 'Geo', 'GMC', 'Gonow', 'Great Wall',
  'Hafei', 'Hindustan', 'Holden', 'Honda', 'HuangHai', 'Hummer', 'Hurtan', 'Hyundai', 'Infiniti', 'Innocenti',
  'Invicta', 'Iran Khodro', 'Irmscher', 'Isdera', 'Isuzu', 'Iveco', 'Izh', 'JAC', 'Jaguar', 'Jeep', 'Jensen',
  'Jiangling', 'Kamaz', 'Kia', 'Koenigsegg', 'KTM', 'Lamborghini', 'Lancia', 'Land Rover', 'Landwind', 'Lexus',
  'Liebao Motor', 'Lifan', 'Lincoln', 'Lotus', 'LTI', 'LUAZ', 'Mahindra', 'Marcos', 'Marlin', 'Maruti', 'Maserati',
  'Maybach', 'Mazda', 'Mc Laren', 'MCC', 'Mega', 'Mercedes-Benz', 'Mercury', 'Metrocab', 'MG', 'Microcar',
  'Minelli', 'Mini', 'Mitsubishi', 'Mitsuoka', 'Monte Carlo', 'Morgan', 'Morris', 'Moskvich', 'Nissan', 'Noble',
  'Oldsmobile', 'Opel', 'Osca', 'Pagani', 'Panoz', 'Paykan', 'Perodua', 'Peugeot', 'Plymouth', 'Pontiac',
  'Porsche', 'Premier', 'Proton', 'PUCH', 'Puma', 'Qvale', 'Reliant', 'Renault', 'Renault Samsung', 'Rolls-Royce',
  'Ronart', 'Rover', 'Saab', 'Saleen', 'Saturn', 'Scion', 'Seat', 'SeAZ', 'ShuangHuan', 'Skoda', 'SMA', 'Smart',
  'SMZ', 'Soueast', 'Spectre', 'Spyker', 'SsangYong', 'Subaru', 'Suzuki', 'TagAz', 'Talbot', 'Tata', 'Tatra',
  'Tesla', 'Tianma', 'Tianye', 'Tofas', 'Toyota', 'Trabant', 'Triumph', 'TVR', 'UAZ', 'Vauxhall', 'VAZ (Lada)',
  'Vector', 'Venturi', 'Vespa', 'Volkswagen', 'Volvo', 'VW-Porsche', 'Wartburg', 'Westfield', 'Wiesmann', 'Xin Kai',
  'YueJin', 'Zastava', 'ZAZ', 'ZIL', 'ZX', 'Altele',
];

// ========== TOATE BRANDURILE TELEFOANE (listă completă, ca la automobile) ==========
export const PHONE_BRANDS_FULL: readonly string[] = [
  'Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Google', 'OnePlus', 'Oppo', 'Realme', 'Vivo', 'Honor', 'Nothing',
  'Nokia', 'Motorola', 'Sony', 'LG', 'Asus', 'ZTE', 'Tecno', 'Infinix', 'Poco', 'iQOO', 'Meizu', 'Black Shark',
  'Fairphone', 'Cat', 'BlackBerry', 'HTC', 'Lenovo', 'Cubot', 'Umidigi', 'Doogee', 'Oukitel',
  'Altele',
];

// ========== SPECIFICAȚII TELEFOANE – opțiuni standard ==========
export const PHONE_STORAGE_OPTIONS = ['32', '64', '128', '256', '512', '1024'] as const;
export const PHONE_RAM_OPTIONS = ['2', '4', '6', '8', '12', '16', '18', '24'] as const;

// ========== TELEFOANE – modele per brand (listă completă, ca la automobile) ==========
export const MODELS_PHONES: Record<string, string[]> = {
  Apple: [
    'iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone 17 Air', 'iPhone 17',
    'iPhone 16e', 'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16',
    'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
    'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
    'iPhone SE 3', 'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13 Mini', 'iPhone 13',
    'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12 Mini', 'iPhone 12',
    'iPhone SE 2', 'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
    'iPhone XR', 'iPhone XS Max', 'iPhone XS', 'iPhone X',
    'iPhone 8 Plus', 'iPhone 8', 'iPhone 7 Plus', 'iPhone 7', 'iPhone SE',
    'iPhone 6S Plus', 'iPhone 6S', 'iPhone 6 Plus', 'iPhone 6',
    'iPhone 5S', 'iPhone 5C', 'iPhone 5', 'iPhone 4S', 'iPhone 4', 'iPhone 3GS', 'iPhone 3G',
  ],
  iPhone: [
    'iPhone 17 Pro Max', 'iPhone 17 Pro', 'iPhone 17 Air', 'iPhone 17',
    'iPhone 16e', 'iPhone 16 Pro Max', 'iPhone 16 Pro', 'iPhone 16 Plus', 'iPhone 16',
    'iPhone 15 Pro Max', 'iPhone 15 Pro', 'iPhone 15 Plus', 'iPhone 15',
    'iPhone 14 Pro Max', 'iPhone 14 Pro', 'iPhone 14 Plus', 'iPhone 14',
    'iPhone SE 3', 'iPhone 13 Pro Max', 'iPhone 13 Pro', 'iPhone 13 Mini', 'iPhone 13',
    'iPhone 12 Pro Max', 'iPhone 12 Pro', 'iPhone 12 Mini', 'iPhone 12',
    'iPhone SE 2', 'iPhone 11 Pro Max', 'iPhone 11 Pro', 'iPhone 11',
    'iPhone XR', 'iPhone XS Max', 'iPhone XS', 'iPhone X',
    'iPhone 8 Plus', 'iPhone 8', 'iPhone 7 Plus', 'iPhone 7', 'iPhone SE',
    'iPhone 6S Plus', 'iPhone 6S', 'iPhone 6 Plus', 'iPhone 6',
    'iPhone 5S', 'iPhone 5C', 'iPhone 5', 'iPhone 4S', 'iPhone 4', 'iPhone 3GS', 'iPhone 3G',
  ],
  Samsung: [
    'Galaxy S24 Ultra', 'Galaxy S24+', 'Galaxy S24', 'Galaxy S23 Ultra', 'Galaxy S23+', 'Galaxy S23', 'Galaxy S23 FE',
    'Galaxy S22 Ultra', 'Galaxy S22+', 'Galaxy S22', 'Galaxy S21 Ultra', 'Galaxy S21+', 'Galaxy S21', 'Galaxy S21 FE',
    'Galaxy S20 Ultra', 'Galaxy S20+', 'Galaxy S20', 'Galaxy S10+', 'Galaxy S10', 'Galaxy S10e', 'Galaxy S9+', 'Galaxy S9', 'Galaxy S8+', 'Galaxy S8',
    'Galaxy Z Fold 5', 'Galaxy Z Fold 4', 'Galaxy Z Fold 3', 'Galaxy Z Flip 5', 'Galaxy Z Flip 4', 'Galaxy Z Flip 3',
    'Galaxy A55', 'Galaxy A54', 'Galaxy A35', 'Galaxy A34', 'Galaxy A25', 'Galaxy A24', 'Galaxy A15', 'Galaxy A14', 'Galaxy A05', 'Galaxy A04',
    'Galaxy A52', 'Galaxy A51', 'Galaxy A50', 'Galaxy A32', 'Galaxy A31', 'Galaxy A22', 'Galaxy A21', 'Galaxy A12', 'Galaxy A02',
    'Galaxy M54', 'Galaxy M34', 'Galaxy M14', 'Galaxy M53', 'Galaxy M33', 'Galaxy M13', 'Galaxy M52', 'Galaxy M32', 'Galaxy M12',
    'Galaxy F54', 'Galaxy F34', 'Galaxy F14', 'Galaxy F52', 'Galaxy F42', 'Galaxy F22', 'Galaxy F12',
    'Galaxy Note 20 Ultra', 'Galaxy Note 20', 'Galaxy Note 10+', 'Galaxy Note 10', 'Galaxy Note 9', 'Galaxy Note 8',
    'Galaxy XCover 6', 'Galaxy XCover 5', 'Galaxy Tab S9', 'Galaxy Tab A',
  ],
  Xiaomi: [
    '14 Ultra', '14 Pro', '14', '13T Pro', '13T', '13 Lite', '13', '12T Pro', '12T', '12 Lite', '12', '12 Pro',
    '11T Pro', '11T', '11 Lite', '11', '11 Ultra', '10T Pro', '10T', '10', '9T Pro', '9T', '9', '9 Lite',
    'Redmi Note 13 Pro+', 'Redmi Note 13 Pro', 'Redmi Note 13', 'Redmi Note 12 Pro+', 'Redmi Note 12 Pro', 'Redmi Note 12', 'Redmi Note 12 Turbo',
    'Redmi Note 11 Pro+', 'Redmi Note 11 Pro', 'Redmi Note 11', 'Redmi Note 10 Pro', 'Redmi Note 10', 'Redmi Note 9 Pro', 'Redmi Note 9', 'Redmi Note 8 Pro', 'Redmi Note 8',
    'Redmi 13C', 'Redmi 12', 'Redmi 12C', 'Redmi A3', 'Redmi A2', 'Redmi A1+', 'Redmi A1',
    'POCO F6 Pro', 'POCO F6', 'POCO F5 Pro', 'POCO F5', 'POCO F4', 'POCO F3', 'POCO X6 Pro', 'POCO X6', 'POCO X5 Pro', 'POCO X5', 'POCO X4 Pro', 'POCO X3 Pro',
    'POCO M6 Pro', 'POCO M5', 'POCO M4 Pro', 'POCO M3', 'POCO C65', 'POCO C55', 'POCO C51',
  ],
  Huawei: [
    'P60 Pro', 'P60', 'P50 Pro', 'P50', 'P50 Pocket', 'P40 Pro', 'P40', 'P30 Pro', 'P30', 'P20 Pro', 'P20', 'P10', 'P9',
    'Mate 60 Pro', 'Mate 60', 'Mate 50 Pro', 'Mate 50', 'Mate 40 Pro', 'Mate 40', 'Mate 30 Pro', 'Mate 30', 'Mate 20 Pro', 'Mate 20', 'Mate 10',
    'Nova 12', 'Nova 12 Pro', 'Nova 11', 'Nova 11 Pro', 'Nova 10', 'Nova 9', 'Nova 8', 'Nova 7', 'Nova 6',
    'Enjoy', 'Y9', 'Y8', 'Y7', 'Y6', 'Mate Xs', 'Mate X', 'P Smart', 'MatePad',
  ],
  Google: ['Pixel 9 Pro', 'Pixel 9', 'Pixel 8a', 'Pixel 8 Pro', 'Pixel 8', 'Pixel 7a', 'Pixel 7 Pro', 'Pixel 7', 'Pixel 6a', 'Pixel 6 Pro', 'Pixel 6', 'Pixel 5a', 'Pixel 5', 'Pixel 4a', 'Pixel 4', 'Pixel 3a', 'Pixel 3'],
  Pixel: ['Pixel 9 Pro', 'Pixel 9', 'Pixel 8a', 'Pixel 8 Pro', 'Pixel 8', 'Pixel 7a', 'Pixel 7 Pro', 'Pixel 7', 'Pixel 6a', 'Pixel 6 Pro', 'Pixel 6', 'Pixel 5a', 'Pixel 5', 'Pixel 4a', 'Pixel 4'],
  OnePlus: ['12', '12R', '11', '11R', 'Nord 4', 'Nord 3', 'Nord 2', 'Nord CE 3', 'Nord CE 2', 'Nord CE', 'Nord N30', 'Nord N20', '10 Pro', '10T', '10R', '9 Pro', '9', '9R', '8 Pro', '8T', '8', '7T Pro', '7T', '7 Pro', '7'],
  Oppo: [
    'Find X7 Ultra', 'Find X7', 'Find X6 Pro', 'Find X6', 'Find X5 Pro', 'Find X5', 'Find X3 Pro', 'Find X3', 'Find X2 Pro', 'Find X2',
    'Reno 11', 'Reno 11 Pro', 'Reno 10 Pro+', 'Reno 10 Pro', 'Reno 10', 'Reno 9 Pro+', 'Reno 9 Pro', 'Reno 9', 'Reno 8 Pro', 'Reno 8', 'Reno 7', 'Reno 6', 'Reno 5', 'Reno 4',
    'A79', 'A78', 'A58', 'A38', 'A18', 'A17', 'A16', 'A15', 'A54', 'A53', 'A52', 'A51', 'A31', 'A16k', 'A15s', 'A74', 'A54', 'A36',
    'F25 Pro', 'F23', 'F21', 'F19', 'F17', 'K11', 'K10', 'K9', 'Reno Z', 'Ace', 'Reno Lite',
  ],
  Realme: [
    'GT 5 Pro', 'GT 5', 'GT 3', 'GT 2 Pro', 'GT 2', 'GT Neo 5', 'GT Neo 3', 'GT Neo 2', 'GT Master', 'GT',
    '12 Pro+', '12 Pro', '12+', '12', '11 Pro+', '11 Pro', '11', '10 Pro+', '10 Pro', '10', '9 Pro+', '9 Pro', '9', '8 Pro', '8', '7 Pro', '7',
    'C67', 'C55', 'C53', 'C51', 'C35', 'C33', 'C30', 'C21', 'C20', 'C15', 'C12', 'C11',
    'Narzo 60', 'Narzo 50', 'Narzo 30', 'Narzo 20', 'Number', 'X', 'V', 'Q',
  ],
  Vivo: [
    'X100 Pro', 'X100', 'X90 Pro', 'X90', 'X80 Pro', 'X80', 'X70 Pro', 'X70', 'X60 Pro', 'X60', 'X50 Pro', 'X50',
    'V30 Pro', 'V30', 'V29', 'V27', 'V25', 'V23', 'V21', 'V20', 'V17', 'V15', 'V11',
    'Y100', 'Y78', 'Y56', 'Y36', 'Y27', 'Y22', 'Y17', 'Y12', 'Y11', 'Y02',
    'iQOO 12', 'iQOO 11', 'iQOO Neo 9', 'iQOO Z9', 'iQOO Z7', 'T2', 'U5',
  ],
  Honor: [
    'Magic 6 Pro', 'Magic 6', 'Magic 5 Pro', 'Magic 5', 'Magic 4 Pro', 'Magic 4', 'Magic 3', 'Magic V2', 'Magic Vs',
    '200 Pro', '200', '90 Pro', '90', '70', '50', '30', '20', '10', '9', '8',
    'X9b', 'X8b', 'X7b', 'X6', 'Play', 'V Purse', 'Pocket',
  ],
  Nothing: ['Phone (2a)', 'Phone (2)', 'Phone (1)'],
  Nokia: [
    'G42', 'G22', 'G21', 'G20', 'G11', 'G10', 'X30', 'X20', 'X10', 'G50', 'G400', 'G100',
    '8.3', '7.2', '6.2', '5.4', '5.3', '3.4', '2.4', '1.4', 'C32', 'C22', 'C21', 'C20', 'C12', 'C10',
    'Lumia', 'PureView', 'Asha',
  ],
  Motorola: [
    'Razr 40 Ultra', 'Razr 40', 'Razr 2023', 'Razr 2022', 'Edge 40 Pro', 'Edge 40', 'Edge 30 Ultra', 'Edge 30 Pro', 'Edge 30', 'Edge 20', 'Edge+',
    'Moto G84', 'Moto G73', 'Moto G72', 'Moto G62', 'Moto G52', 'Moto G42', 'Moto G32', 'Moto G22', 'Moto G12', 'Moto G Power', 'Moto G Stylus',
    'Moto E', 'Defy', 'ThinkPhone',
  ],
  Sony: [
    'Xperia 1 VI', 'Xperia 1 V', 'Xperia 1 IV', 'Xperia 1 III', 'Xperia 1 II', 'Xperia 1',
    'Xperia 5 V', 'Xperia 5 IV', 'Xperia 5 III', 'Xperia 5 II', 'Xperia 5',
    'Xperia 10 VI', 'Xperia 10 V', 'Xperia 10 IV', 'Xperia 10 III', 'Xperia 10 II', 'Xperia 10',
    'Xperia Pro-I', 'Xperia Ace', 'Xperia L', 'Xperia XZ', 'Xperia X', 'Xperia Z',
  ],
  LG: ['Velvet', 'V60', 'V50', 'V40', 'G8X', 'G8', 'G7', 'K92', 'K62', 'K52', 'K42', 'K22', 'Wing', 'Dual Screen', 'Stylo', 'Q series'],
  Asus: ['ROG Phone 8', 'ROG Phone 7', 'ROG Phone 6', 'Zenfone 11', 'Zenfone 10', 'Zenfone 9', 'Zenfone 8', 'Zenfone 7', 'Zenfone 6', 'Rog Phone', 'Zenfone Max'],
  ZTE: ['Axon 60', 'Axon 50', 'Axon 40', 'Axon 30', 'Blade', 'Nubia', 'Red Magic'],
  Tecno: ['Camon 30', 'Camon 20', 'Spark', 'Pova', 'Phantom', 'Pop'],
  Infinix: ['Note 40', 'Note 30', 'Hot', 'Zero', 'Smart', 'Note'],
  Poco: ['F6 Pro', 'F6', 'F5 Pro', 'F5', 'X6 Pro', 'X6', 'X5 Pro', 'X5', 'M6 Pro', 'M5', 'C65', 'C55'],
  iQOO: ['12', '11', 'Neo 9', 'Z9', 'Z7', 'T2', 'U5', 'Neo', 'Z'],
  Meizu: ['21', '20', '18', '17', '16', 'Note', 'M'],
  'Black Shark': ['5', '4', '3', '2', 'Helo'],
  Fairphone: ['5', '4', '3'],
  Cat: ['S62 Pro', 'S61', 'S52', 'S48', 'S42'],
  BlackBerry: ['Key2', 'Keyone', 'Motion', 'Priv', 'DTEK', 'Classic', 'Passport'],
  HTC: ['U23', 'U20', 'Desire', 'One', '10', 'M8', 'M9'],
  Lenovo: ['Legion Phone', 'K series', 'Vibe', 'ZUK', 'Moto (legacy)'],
};

// ========== AUTOVEHICULE – modele per brand (după autodata24 / mobile.ro) ==========
export const MODELS_CARS: Record<string, string[]> = {
  // Dacia – lista completă autodata24
  Dacia: ['1300', '1310', '1325', '1410', 'Bigster', 'Dokker', 'Dokker Van', 'Duster', 'Duster I', 'Duster II', 'Jogger', 'Lodgy', 'Logan', 'Logan I', 'Logan MCV', 'Logan MCV II', 'Logan Van', 'Nova', 'Sandero', 'Sandero I', 'Sandero II', 'Sandero II stepway', 'Solenza', 'Spring'],
  // Volkswagen – lista completă autodata24
  Volkswagen: ['181', 'Amarok', 'Arteon', 'Bora', 'Caddy', 'Corrado', 'Derby', 'Eos', 'Fox', 'Golf', 'Golf IV', 'Golf V', 'Golf VI', 'ID.3', 'ID.4', 'ID.5', 'ID.6', 'ID.Buzz', 'Iltis', 'Jetta', 'Kaefer', 'Lupo', 'Multivan', 'NEW Beetle', 'Passat', 'Passat B5', 'Passat B6', 'Phaeton', 'Pointer', 'Polo', 'Santana', 'Scirocco', 'Sharan', 'T-Cross', 'Taigo', 'Tayron', 'Taro', 'Tiguan', 'Touareg', 'Touran', 'Transporter', 'Up!', 'Vento', 'W12'],
  VW: ['181', 'Amarok', 'Arteon', 'Bora', 'Caddy', 'Corrado', 'Derby', 'Eos', 'Fox', 'Golf', 'ID.3', 'ID.4', 'ID.5', 'ID.6', 'ID.Buzz', 'Jetta', 'Multivan', 'NEW Beetle', 'Passat', 'Polo', 'Scirocco', 'Sharan', 'T-Cross', 'Taigo', 'Tayron', 'Tiguan', 'Touareg', 'Touran', 'Transporter', 'Up!', 'Vento'],
  // BMW – lista completă autodata24
  BMW: ['1er', '2er', '2er Active Tourer', '2er Grand Tourer', '3er', '4er', '5er', '6er', '7er', '8er', 'i3', 'i4', 'i5', 'i7', 'i8', 'iX', 'iX1', 'iX2', 'iX3', 'M3', 'M5', 'M6', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z1', 'Z3', 'Z4', 'Z8'],
  'Mercedes-Benz': ['Clasa A', 'Clasa B', 'Clasa C', 'Clasa E', 'Clasa S', 'Clasa CLA', 'Clasa CLS', 'Clasa GLA', 'Clasa GLB', 'Clasa GLC', 'Clasa GLE', 'Clasa GLS', 'Clasa G', 'Clasa EQA', 'Clasa EQB', 'Clasa EQC', 'Clasa EQE', 'Clasa EQS', 'Clasa EQS SUV', 'AMG GT', 'AMG SL', 'Citan', 'Vito', 'Viano', 'Sprinter', 'E-Class', 'S-Class', 'G-Class'],
  Audi: ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'e-tron', 'e-tron GT', 'e-tron S', 'RS3', 'RS4', 'RS5', 'RS6', 'RS7', 'RS Q8', 'TT', 'R8'],
  Ford: ['B-Max', 'C-Max', 'Fiesta', 'Focus', 'Fusion', 'Galaxy', 'Ka', 'Kuga', 'Mondeo', 'Mustang', 'Mustang Mach-E', 'Puma', 'Ranger', 'S-Max', 'Tourneo Connect', 'Tourneo Custom', 'Transit', 'Transit Connect', 'Explorer', 'Edge', 'Bronco'],
  Opel: ['Adam', 'Ampera', 'Ampera-e', 'Astra', 'Combo', 'Corsa', 'Crossland', 'Grandland', 'Insignia', 'Mokka', 'Vivaro', 'Zafira', 'Zafira Life'],
  Renault: ['Arkana', 'Austral', 'Captur', 'Clio', 'Espace', 'Express', 'Kadjar', 'Kangoo', 'Koleos', 'Master', 'Megane', 'Scenic', 'Talisman', 'Twingo', 'Trafic', 'Zoe', 'Rafale'],
  Peugeot: ['106', '107', '108', '2008', '208', '3008', '308', '408', '5008', '508', 'Partner', 'Rifter', 'Traveller', 'Expert', 'Boxer', 'e-208', 'e-2008', 'e-308', 'e-3008'],
  Citroen: ['Ami', 'Berlingo', 'C1', 'C2', 'C3', 'C3 Aircross', 'C4', 'C4 Cactus', 'C4 X', 'C5', 'C5 Aircross', 'C5 X', 'DS3', 'DS4', 'DS5', 'Jumpy', 'Spacetourer', 'e-C4', 'e-C4 X'],
  Citroën: ['Ami', 'Berlingo', 'C1', 'C2', 'C3', 'C3 Aircross', 'C4', 'C4 Cactus', 'C4 X', 'C5', 'C5 Aircross', 'C5 X', 'Jumpy', 'Spacetourer', 'e-C4', 'e-C4 X'],
  Toyota: ['Aygo', 'Aygo X', 'Yaris', 'Yaris Cross', 'Corolla', 'Corolla Verso', 'Camry', 'C-HR', 'RAV4', 'Highlander', 'Land Cruiser', 'Hilux', 'Proace', 'bZ4X', 'bZ3', 'Prius', 'Mirai', 'Supra', 'GR86', 'GR Yaris', 'GR Corolla'],
  Hyundai: ['i10', 'i20', 'i30', 'Bayon', 'Kona', 'Tucson', 'Santa Fe', 'Staria', 'IONIQ 5', 'IONIQ 6', 'IONIQ 7', 'Genesis', 'Porter', 'H-1'],
  Kia: ['Picanto', 'Rio', 'Ceed', 'Stonic', 'Niro', 'Sportage', 'Sorento', 'Carnival', 'EV6', 'EV9', 'e-Niro', 'Stinger', 'XCeed', 'ProCeed'],
  Skoda: ['Citigo', 'Fabia', 'Scala', 'Octavia', 'Superb', 'Kamiq', 'Karoq', 'Kodiaq', 'Enyaq', 'Enyaq Coupe', 'Elli'],
  Škoda: ['Citigo', 'Fabia', 'Scala', 'Octavia', 'Superb', 'Kamiq', 'Karoq', 'Kodiaq', 'Enyaq', 'Enyaq Coupe'],
  Seat: ['Ibiza', 'Leon', 'Arona', 'Ateca', 'Tarraco', 'Cordoba', 'Altea', 'Exeo', 'Cupra Born', 'Cupra Formentor', 'Cupra Leon', 'Cupra Ateca'],
  Fiat: ['500', '500e', '500X', '500L', 'Panda', 'Tipo', 'Ducato', 'Doblo', 'Scudo', 'Fiorino', 'Fullback', '124 Spider', 'Bravo', 'Punto', 'Stilo'],
  Honda: ['Jazz', 'Civic', 'HR-V', 'CR-V', 'e', 'ZR-V', 'NSX', 'Legend', 'FR-V', 'Stream'],
  Mazda: ['2', '3', '6', 'CX-3', 'CX-30', 'CX-5', 'CX-60', 'CX-80', 'MX-5', 'MX-30', 'Premacy', 'MPV'],
  Nissan: ['Micra', 'Leaf', 'Juke', 'Qashqai', 'X-Trail', 'Ariya', 'Navara', 'Patrol', 'GT-R', '370Z', 'Note', 'Pulsar', 'e-NV200'],
  Volvo: ['C30', 'C40', 'S60', 'S90', 'V40', 'V60', 'V90', 'XC40', 'XC60', 'XC90', 'EX30', 'EX90', 'EM90'],
  'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Evoque'],
  Jeep: ['Renegade', 'Compass', 'Wrangler', 'Grand Cherokee', 'Avenger', 'Cherokee', 'Commander', 'Gladiator'],
  Porsche: ['911', '718 Boxster', '718 Cayman', 'Panamera', 'Cayenne', 'Macan', 'Taycan', 'Cayenne Coupe', 'Macan Electric'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck', 'Roadster'],
  'Alfa Romeo': ['Giulia', 'Stelvio', 'Tonale', 'MiTo', 'Giulietta', '4C', 'Spider', 'Brera', '159', '147'],
  Chevrolet: ['Spark', 'Aveo', 'Cruze', 'Orlando', 'Captiva', 'Trax', 'Equinox', 'Camaro', 'Corvette', 'Tahoe', 'Suburban'],
  Chrysler: ['300C', 'Voyager', 'Pacifica', 'Grand Voyager', 'PT Cruiser', 'Sebring', 'Crossfire'],
  Dodge: ['Challenger', 'Charger', 'Durango', 'Journey', 'Caliber', 'Nitro', 'Ram'],
  Jaguar: ['XE', 'XF', 'XJ', 'E-Pace', 'F-Pace', 'I-Pace', 'F-Type', 'X-Type', 'S-Type'],
  Lexus: ['IS', 'ES', 'GS', 'LS', 'UX', 'NX', 'RX', 'LX', 'LC', 'RC', 'CT', 'RZ'],
  Mini: ['Cooper', 'Cooper S', 'Clubman', 'Countryman', 'Convertible', 'Electric', 'Aceman'],
  Mitsubishi: ['Space Star', 'ASX', 'Eclipse Cross', 'Outlander', 'L200', 'Pajero', 'i-MiEV'],
  'Renault Samsung': ['SM3', 'SM5', 'SM7', 'QM5', 'QM3'],
  Saab: ['9-3', '9-5', '9-3X', '9-4X', '900', '9000'],
  Subaru: ['Impreza', 'WRX', 'Legacy', 'Outback', 'Forester', 'XV', 'BRZ', 'Solterra', 'Levorg'],
  Suzuki: ['Swift', 'Ignis', 'Baleno', 'Vitara', 'S-Cross', 'Across', 'Jimny', 'Alto', 'Splash', 'Wagon R'],
  SsangYong: ['Tivoli', 'Korando', 'Rexton', 'Musso', 'Actyon', 'Kyron', 'Rodius', 'Stavic'],
  BYD: ['Atto 3', 'Seal', 'Han', 'Tang', 'Dolphin', 'Song Plus', 'Yuan Plus', 'Seal U'],
  Chery: ['Omoda 5', 'Tiggo 7', 'Tiggo 8', 'Arrizo 6', 'eQ7', 'Fulwin'],
  Geely: ['Coolray', 'Atlas', 'Emgrand', 'Geometry C', 'Geometry E'],
  DAF: ['LF', 'CF', 'XF', 'XF105', 'XF106'],
  Iveco: ['Daily', 'Eurocargo', 'Stralis', 'Trakker', 'S-Way', 'Massif'],
  Isuzu: ['D-Max', 'MU-X', 'Rodeo', 'Trooper', 'NQR', 'FRR', 'FSR'],
  Acura: ['ILX', 'TLX', 'RLX', 'Integra', 'MDX', 'RDX', 'NSX'],
  'Aston Martin': ['DB11', 'DBS', 'Vantage', 'DBX', 'Valkyrie', 'Rapide'],
  Bentley: ['Continental GT', 'Bentayga', 'Flying Spur', 'Mulsanne', 'Continental GTC'],
  Ferrari: ['Roma', 'Portofino', 'SF90', '296', 'Purosangue', 'F8', '812', 'SF90 Stradale'],
  Lamborghini: ['Huracan', 'Urus', 'Revuelto', 'Aventador', 'Gallardo', 'Murcielago'],
  Maserati: ['Ghibli', 'Quattroporte', 'Levante', 'Grecale', 'MC20', 'GranTurismo'],
  'Rolls-Royce': ['Ghost', 'Wraith', 'Dawn', 'Cullinan', 'Spectre', 'Phantom'],
  Cadillac: ['CT4', 'CT5', 'Escalade', 'Lyriq', 'XT4', 'XT5', 'XT6'],
  Lincoln: ['Continental', 'MKZ', 'Aviator', 'Nautilus', 'Navigator', 'Corsair', 'Zephyr'],
  GMC: ['Sierra', 'Canyon', 'Terrain', 'Acadia', 'Yukon', 'Hummer EV'],
  Infiniti: ['Q30', 'Q50', 'QX50', 'QX55', 'QX60', 'QX80', 'QX30'],
  Lotus: ['Emira', 'Eletre', 'Evora', 'Elise', 'Exige'],
  'Mc Laren': ['GT', '720S', '765LT', 'Artura', '750S', 'P1', '570S'],
  Daewoo: ['Lanos', 'Nubira', 'Leganza', 'Matiz', 'Kalos', 'Tacuma', 'Evanda'],
  Aro: ['10', '24', '243', '244', '246', 'M461'],
};

// ========== MOTOCICLETE – modele per brand (exemple) ==========
export const MODELS_MOTO: Record<string, string[]> = {
  Honda: ['CBR650R', 'CB650R', 'Africa Twin', 'NC750X', 'Forza', 'PCX', 'SH'],
  Yamaha: ['MT-07', 'MT-09', 'R7', 'R1', 'Tracer 7', 'Tracer 9', 'NMAX', 'XMAX'],
  Kawasaki: ['Ninja 400', 'Ninja 650', 'Z650', 'Z900', 'Versys 650', 'Versys 1000', 'KX'],
  Suzuki: ['GSX-S750', 'GSX-R750', 'V-Strom 650', 'V-Strom 1050', 'Burgman', 'Address'],
  KTM: ['Duke 390', 'Duke 790', 'Adventure 390', 'Adventure 1290', 'RC 390'],
  BMW: ['G 310 R', 'F 750 GS', 'F 850 GS', 'R 1250 GS', 'S 1000 RR', 'C 400 X'],
  Ducati: ['Monster', 'Scrambler', 'Panigale', 'Multistrada', 'Diavel', 'Streetfighter'],
};

// ========== CAPACITATE CILINDRICĂ (autovehicule) ==========
export const ENGINE_CAPACITY_OPTIONS = [
  '0.6', '0.8', '0.9', '1.0', '1.2', '1.4', '1.5', '1.6', '1.8', '2.0', '2.2', '2.5', '3.0', '3.5', '4.0', '4.4', '5.0', '5.5', '6.0', '6.2', '8.0',
] as const;

/** Subcategorii care au modele per brand (telefoane) */
export const SUBCATEGORIES_WITH_PHONE_MODELS = ['telefoane', 'Telefoane Mobile', 'tablete', 'Tablete'];

/** Subcategorii care au modele + capacitate cilindrică (autovehicule) */
export const SUBCATEGORIES_WITH_CAR_MODELS = [
  'autoturisme', 'Autoturisme', 'suv-4x4', 'SUV & 4x4', 'motociclete', 'Motociclete',
  'camioane', 'Camioane', 'remorci', 'Remorci', 'autorulote', 'Autorulote',
  'vehicule-electrice', 'Vehicule electrice', 'piese-auto', 'Piese auto',
];

/**
 * Returnează lista de modele pentru un brand în funcție de subcategorie.
 * brand = numele afișat (ex: "Apple", "BMW").
 */
export function getModelsForBrand(brand: string, subcategoryKeyOrName: string): string[] {
  if (!brand || !subcategoryKeyOrName) return [];
  const sub = String(subcategoryKeyOrName).toLowerCase().replace(/\s+/g, '-');
  const isPhone = SUBCATEGORIES_WITH_PHONE_MODELS.some(
    (s) => s.toLowerCase().replace(/\s+/g, '-') === sub || sub.includes('telefoane') || sub.includes('tablete')
  );
  const isCar = SUBCATEGORIES_WITH_CAR_MODELS.some(
    (s) => s.toLowerCase().replace(/\s+/g, '-') === sub || sub.includes('autoturisme') || sub.includes('suv') || sub.includes('motociclete') || sub.includes('camioane')
  );
  if (isPhone) {
    return MODELS_PHONES[brand] ?? MODELS_PHONES[brand.trim()] ?? [];
  }
  if (isCar) {
    const forMoto = sub.includes('motociclete');
    return forMoto ? (MODELS_MOTO[brand] ?? []) : (MODELS_CARS[brand] ?? MODELS_CARS[brand.trim()] ?? []);
  }
  return [];
}

/**
 * Verifică dacă subcategoria afișează câmpul Model în secțiunea principală.
 */
export function hasModelInMainSection(subcategoryKeyOrName: string): boolean {
  const sub = String(subcategoryKeyOrName).toLowerCase().replace(/\s+/g, '-');
  return (
    SUBCATEGORIES_WITH_PHONE_MODELS.some((s) => s.toLowerCase().replace(/\s+/g, '-') === sub) ||
    SUBCATEGORIES_WITH_CAR_MODELS.some((s) => s.toLowerCase().replace(/\s+/g, '-') === sub)
  );
}

/**
 * Verifică dacă subcategoria afișează câmpul Capacitate cilindrică.
 */
export function hasEngineCapacityInMainSection(subcategoryKeyOrName: string): boolean {
  const sub = String(subcategoryKeyOrName).toLowerCase().replace(/\s+/g, '-');
  return (
    sub.includes('autoturisme') || sub.includes('suv') || sub.includes('motociclete') ||
    sub.includes('camioane') || sub.includes('piese-auto') || sub === 'vehicule-electrice'
  );
}

/**
 * Verifică dacă subcategoria afișează specificațiile telefoan (RAM, Capacitate stocare) în secțiunea principală.
 */
export function hasPhoneSpecsInMainSection(subcategoryKeyOrName: string): boolean {
  const sub = String(subcategoryKeyOrName).toLowerCase().replace(/\s+/g, '-');
  return sub.includes('telefoane') || sub.includes('tablete');
}
