"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import UniversalHeader from "../../components/UniversalHeader";
import DashboardFooter from "../../components/DashboardFooter";

export default function CategoriesPage() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatar: ''
  });

  useEffect(() => {
    // Load dark mode preference
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode !== null) {
      setIsDarkMode(savedDarkMode === 'true');
    }

    // Load user info
    const savedUserInfo = localStorage.getItem('userInfo');
    if (savedUserInfo) {
      try {
        setUserInfo(JSON.parse(savedUserInfo));
      } catch (e) {
        console.error('Error parsing userInfo:', e);
      }
    }
  }, []);

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    localStorage.setItem('darkMode', String(newDarkMode));
  };

  const categories = [
    {
      name: "Imobiliare",
      icon: <i className="ri-home-line text-3xl"></i>,
      image: "/images/categories/category-imobiliare.jpg",
      subcategories: [
        { name: "Apartamente", key: "apartamente" },
        { name: "Case și Vile", key: "case-vile" },
        { name: "Terenuri Intravilane", key: "terenuri-intravilane" },
        { name: "Terenuri Agricole", key: "terenuri-agricole" },
        { name: "Spații Comerciale", key: "spatii-comerciale" },
        { name: "Hale Industriale", key: "hale-industriale" },
        { name: "Proprietăți Turistice", key: "proprietati-turistice" }
      ]
    },
    {
      name: "Autovehicule",
      icon: <i className="ri-car-line text-3xl"></i>,
      image: "/images/categories/category-auto.jpg",
      subcategories: [
        { name: "Autoturisme", key: "autoturisme" },
        { name: "Motociclete", key: "motociclete" },
        { name: "Camioane și Utilitare", key: "camioane-utilitare" },
        { name: "Piese Auto și Accesorii", key: "piese-auto" },
        { name: "Remorci", key: "remorci" }
      ]
    },
    {
      name: "Electronice",
      icon: <i className="ri-smartphone-line text-3xl"></i>,
      image: "/images/categories/category-electronice.jpg",
      subcategories: [
        { name: "Telefoane", key: "telefoane" },
        { name: "Laptop-uri", key: "laptop-uri" },
        { name: "Televizoare", key: "televizoare" },
        { name: "Accesorii", key: "accesorii-electronice" }
      ]
    },
    {
      name: "Modă",
      icon: <i className="ri-shirt-line text-3xl"></i>,
      image: "/images/categories/category-moda.jpg",
      subcategories: [
        { name: "Îmbrăcăminte", key: "imbracaminte" },
        { name: "Încălțăminte", key: "incaltaminte" },
        { name: "Accesorii", key: "accesorii-moda" },
        { name: "Bijuterii", key: "bijuterii" }
      ]
    },
    {
      name: "Mama și copilul",
      icon: <i className="ri-parent-line text-3xl"></i>,
      image: "/images/categories/category-moda.jpg",
      subcategories: [
        { name: "Haine copil", key: "haine-copil" },
        { name: "Încălțăminte copil", key: "incaltaminte-copil" },
        { name: "Jucării", key: "jucarii" },
        { name: "Mobilier copil", key: "mobilier-copil" },
        { name: "Coșul copilului", key: "cosul-copilului" },
        { name: "Îngrijire bebeluși", key: "ingrijire-bebelusi" },
        { name: "Scaune auto copil", key: "scaune-auto-copil" },
        { name: "Cărucioare", key: "carucioare" },
        { name: "Hranire copil", key: "hranire-copil" }
      ]
    },
    {
      name: "Artă",
      icon: <i className="ri-palette-line text-3xl"></i>,
      image: "/images/categories/category-arta.jpg",
      subcategories: [
        { name: "Pictură", key: "pictura" },
        { name: "Sculptură", key: "sculptura" },
        { name: "Fotografie", key: "fotografie" },
        { name: "Artă Decorativă", key: "arta-decorativa" }
      ]
    },
    {
      name: "Antichități",
      icon: <i className="ri-ancient-pavilion-line text-3xl"></i>,
      image: "/images/categories/category-antichitati.jpg",
      subcategories: [
        { name: "Mobilier Antic", key: "mobilier-antic" },
        { name: "Obiecte de Colecție", key: "obiecte-colectie" },
        { name: "Artefacte", key: "artefacte" }
      ]
    },
    {
      name: "Executări",
      icon: <i className="ri-file-list-line text-3xl"></i>,
      image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      subcategories: [
        { name: "Imobiliare", key: "exec-imobiliare" },
        { name: "Autovehicule", key: "exec-autovehicule" },
        { name: "Industrial", key: "exec-industrial" },
        { name: "Afaceri", key: "exec-afaceri" },
        { name: "Office", key: "exec-office" },
        { name: "Altele", key: "exec-altele" }
      ]
    },
    {
      name: "Utilaje și Echipamente",
      icon: <i className="ri-tools-line text-3xl"></i>,
      image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      subcategories: [
        { name: "Construcții", key: "utilaje-constructii" },
        { name: "Agricole", key: "utilaje-agricole" },
        { name: "Industriale", key: "utilaje-industriale" },
        { name: "Gradinarit", key: "utilaje-gradinarit" }
      ]
    },
    {
      name: "Mobilier",
      icon: <i className="ri-sofa-line text-3xl"></i>,
      image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      subcategories: [
        { name: "Living", key: "mobilier-living" },
        { name: "Dormitor", key: "mobilier-dormitor" },
        { name: "Bucătărie", key: "mobilier-bucatarie" },
        { name: "Birou", key: "mobilier-birou" }
      ]
    }
  ];

  return (
    <div className={`min-h-screen transition-colors duration-300 backdrop-blur-md ${
      isDarkMode 
        ? 'bg-gray-900/30' 
        : 'bg-white/40'
    }`}>
      <UniversalHeader 
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Page Header – compact pe mobil */}
      <section className={`py-6 md:py-16 transition-colors duration-300 backdrop-blur-md ${
        isDarkMode 
          ? 'bg-gray-900/30' 
          : 'bg-white/40'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-4 md:mb-12">
            <div className="flex items-center justify-center gap-2 md:gap-4 mb-2 md:mb-4">
              <div className={`inline-flex items-center justify-center w-10 h-10 md:w-20 md:h-20 rounded-full shadow-xl md:shadow-2xl transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-gradient-to-r from-blue-600 to-pink-600' 
                  : 'bg-gradient-to-r from-blue-500 to-pink-500'
              }`}>
                <i className="ri-apps-line text-white text-xl md:text-4xl"></i>
              </div>
              <h1 className={`text-2xl md:text-5xl lg:text-6xl font-bold transition-colors duration-300 ${
                isDarkMode 
                  ? 'bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent'
                  : 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent'
              }`}>
                Categorii
              </h1>
            </div>
            <p className={`text-sm md:text-xl transition-colors duration-300 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Explorează toate categoriile de licitații disponibile
            </p>
          </div>
        </div>
      </section>

      {/* Categories Grid – compact pe mobil */}
      <section className={`py-4 md:py-12 transition-colors duration-300 backdrop-blur-md ${
        isDarkMode 
          ? 'bg-gray-900/30' 
          : 'bg-white/40'
      }`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 lg:gap-8">
            {categories.map((category, index) => (
              <div
                key={index}
                className={`group relative overflow-hidden rounded-xl md:rounded-2xl transition-all duration-300 hover:scale-[1.02] md:hover:scale-105 hover:shadow-xl md:hover:shadow-2xl backdrop-blur-md ${
                  isDarkMode 
                    ? 'bg-white/20 border border-white/30' 
                    : 'bg-white/50 border border-gray-200/50 shadow-md md:shadow-lg hover:shadow-xl'
                }`}
              >
                {/* Category Image – mai mic pe mobil */}
                <div className="relative h-28 md:h-48 overflow-hidden">
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                    priority={index < 3}
                  />
                  <div className={`absolute inset-0 transition-all duration-300 ${
                    isDarkMode 
                      ? 'bg-gradient-to-t from-gray-900/90 via-gray-900/50 to-transparent group-hover:from-gray-900/95' 
                      : 'bg-gradient-to-t from-gray-900/80 via-gray-900/40 to-transparent group-hover:from-gray-900/90'
                  }`}></div>
                  <div className="absolute top-2 right-2 md:top-4 md:right-4 text-white/90 group-hover:text-white transition-all duration-300 transform group-hover:scale-110 z-10 text-xl md:text-3xl">
                    {category.icon}
                  </div>
                  <div className="absolute bottom-2 left-2 md:bottom-4 md:left-4 z-10">
                    <h3 className="text-lg md:text-2xl font-bold text-white drop-shadow-lg">
                      {category.name}
                    </h3>
                  </div>
                </div>
                
                {/* Subcategories List – compact pe mobil */}
                <div className="p-3 md:p-6">
                  <div className="space-y-1 md:space-y-2">
                    {category.subcategories.map((subcat, subIndex) => (
                      <a
                        key={subIndex}
                        href={`/ro?category=${category.name.toLowerCase().replace(/\s+/g, '-').replace(/ă/g, 'a').replace(/â/g, 'a').replace(/î/g, 'i').replace(/ș/g, 's').replace(/ț/g, 't')}&subcategory=${subcat.key}`}
                        className={`block px-3 py-1.5 md:px-4 md:py-2 rounded-md md:rounded-lg transition-all duration-300 hover:scale-[1.01] md:hover:scale-105 ${
                          isDarkMode 
                            ? 'bg-white/20 hover:bg-white/30 text-gray-300 hover:text-white backdrop-blur-md' 
                            : 'bg-white/50 hover:bg-white/60 text-gray-700 hover:text-gray-900 backdrop-blur-md'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm md:text-base font-medium">{subcat.name}</span>
                          <i className="ri-arrow-right-line text-sm md:text-base"></i>
                        </div>
                      </a>
                    ))}
                  </div>
                  
                  <a
                    href={`/ro?category=${category.name.toLowerCase().replace(/\s+/g, '-').replace(/ă/g, 'a').replace(/â/g, 'a').replace(/î/g, 'i').replace(/ș/g, 's').replace(/ț/g, 't')}`}
                    className={`mt-2 md:mt-4 block w-full text-center px-3 py-2 md:px-4 md:py-3 rounded-md md:rounded-lg text-sm md:text-base font-semibold transition-all duration-300 ${
                      isDarkMode
                        ? 'bg-gradient-to-r from-blue-600 to-pink-600 hover:from-blue-700 hover:to-pink-700 text-white'
                        : 'bg-gradient-to-r from-blue-500 to-pink-500 hover:from-blue-600 hover:to-pink-600 text-white'
                    }`}
                  >
                    Vezi toate listările
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}


