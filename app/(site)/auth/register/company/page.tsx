"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import { ButtonWithIcon } from "@/components/ui/button-with-icon";
import VerificationCodeModal from "@/components/VerificationCodeModal";
import DashboardFooter from "@/components/DashboardFooter";
import { supabase } from "@/lib/supabase";

// Lista cu principalele țări din Europa (România implicită)
const countries = [
  { code: "RO", name: "România", dialCode: "+40", flag: "🇷🇴" },
  { code: "AL", name: "Albania", dialCode: "+355", flag: "🇦🇱" },
  { code: "AD", name: "Andorra", dialCode: "+376", flag: "🇦🇩" },
  { code: "AM", name: "Armenia", dialCode: "+374", flag: "🇦🇲" },
  { code: "AT", name: "Austria", dialCode: "+43", flag: "🇦🇹" },
  { code: "BY", name: "Belarus", dialCode: "+375", flag: "🇧🇾" },
  { code: "BE", name: "Belgia", dialCode: "+32", flag: "🇧🇪" },
  { code: "BA", name: "Bosnia și Herțegovina", dialCode: "+387", flag: "🇧🇦" },
  { code: "BG", name: "Bulgaria", dialCode: "+359", flag: "🇧🇬" },
  { code: "HR", name: "Croația", dialCode: "+385", flag: "🇭🇷" },
  { code: "CY", name: "Cipru", dialCode: "+357", flag: "🇨🇾" },
  { code: "CZ", name: "Cehia", dialCode: "+420", flag: "🇨🇿" },
  { code: "DK", name: "Danemarca", dialCode: "+45", flag: "🇩🇰" },
  { code: "EE", name: "Estonia", dialCode: "+372", flag: "🇪🇪" },
  { code: "FO", name: "Insulele Feroe", dialCode: "+298", flag: "🇫🇴" },
  { code: "FI", name: "Finlanda", dialCode: "+358", flag: "🇫🇮" },
  { code: "FR", name: "Franța", dialCode: "+33", flag: "🇫🇷" },
  { code: "GE", name: "Georgia", dialCode: "+995", flag: "🇬🇪" },
  { code: "DE", name: "Germania", dialCode: "+49", flag: "🇩🇪" },
  { code: "GI", name: "Gibraltar", dialCode: "+350", flag: "🇬🇮" },
  { code: "GR", name: "Grecia", dialCode: "+30", flag: "🇬🇷" },
  { code: "GL", name: "Groenlanda", dialCode: "+299", flag: "🇬🇱" },
  { code: "HU", name: "Ungaria", dialCode: "+36", flag: "🇭🇺" },
  { code: "IS", name: "Islanda", dialCode: "+354", flag: "🇮🇸" },
  { code: "IE", name: "Irlanda", dialCode: "+353", flag: "🇮🇪" },
  { code: "IM", name: "Isle of Man", dialCode: "+44", flag: "🇮🇲" },
  { code: "IT", name: "Italia", dialCode: "+39", flag: "🇮🇹" },
  { code: "JE", name: "Jersey", dialCode: "+44", flag: "🇯🇪" },
  { code: "LV", name: "Letonia", dialCode: "+371", flag: "🇱🇻" },
  { code: "LI", name: "Liechtenstein", dialCode: "+423", flag: "🇱🇮" },
  { code: "LT", name: "Lituania", dialCode: "+370", flag: "🇱🇹" },
  { code: "LU", name: "Luxemburg", dialCode: "+352", flag: "🇱🇺" },
  { code: "MT", name: "Malta", dialCode: "+356", flag: "🇲🇹" },
  { code: "MD", name: "Moldova", dialCode: "+373", flag: "🇲🇩" },
  { code: "MC", name: "Monaco", dialCode: "+377", flag: "🇲🇨" },
  { code: "ME", name: "Muntenegru", dialCode: "+382", flag: "🇲🇪" },
  { code: "NL", name: "Țările de Jos", dialCode: "+31", flag: "🇳🇱" },
  { code: "MK", name: "Macedonia de Nord", dialCode: "+389", flag: "🇲🇰" },
  { code: "NO", name: "Norvegia", dialCode: "+47", flag: "🇳🇴" },
  { code: "PL", name: "Polonia", dialCode: "+48", flag: "🇵🇱" },
  { code: "PT", name: "Portugalia", dialCode: "+351", flag: "🇵🇹" },
  { code: "RU", name: "Rusia", dialCode: "+7", flag: "🇷🇺" },
  { code: "SM", name: "San Marino", dialCode: "+378", flag: "🇸🇲" },
  { code: "RS", name: "Serbia", dialCode: "+381", flag: "🇷🇸" },
  { code: "SK", name: "Slovacia", dialCode: "+421", flag: "🇸🇰" },
  { code: "SI", name: "Slovenia", dialCode: "+386", flag: "🇸🇮" },
  { code: "ES", name: "Spania", dialCode: "+34", flag: "🇪🇸" },
  { code: "SE", name: "Suedia", dialCode: "+46", flag: "🇸🇪" },
  { code: "CH", name: "Elveția", dialCode: "+41", flag: "🇨🇭" },
  { code: "TR", name: "Turcia", dialCode: "+90", flag: "🇹🇷" },
  { code: "UA", name: "Ucraina", dialCode: "+380", flag: "🇺🇦" },
  { code: "GB", name: "Marea Britanie", dialCode: "+44", flag: "🇬🇧" },
  { code: "VA", name: "Vatican", dialCode: "+39", flag: "🇻🇦" },
];

const PASSWORD_REQUIREMENTS = [
  {
    label: "Minim 10 caractere",
    test: (value: string) => value.length >= 10
  },
  {
    label: "Cel puțin o literă mică",
    test: (value: string) => /[a-z]/.test(value)
  },
  {
    label: "Cel puțin o literă mare",
    test: (value: string) => /[A-Z]/.test(value)
  },
  {
    label: "Cel puțin o cifră",
    test: (value: string) => /\d/.test(value)
  },
  {
    label: "Cel puțin un caracter special",
    test: (value: string) => /[^A-Za-z0-9]/.test(value)
  }
];

function calculatePasswordScore(value: string): number {
  let score = 0;
  PASSWORD_REQUIREMENTS.forEach((req) => {
    if (req.test(value)) score += 1;
  });
  return score;
}

function passwordStrengthLabel(score: number): { label: string; color: string } {
  if (score <= 2) return { label: "Parolă slabă", color: "text-red-400" };
  if (score === 3) return { label: "Parolă moderată", color: "text-yellow-400" };
  if (score === 4) return { label: "Parolă bună", color: "text-blue-400" };
  return { label: "Parolă foarte bună", color: "text-green-400" };
}

function generateStrongPassword(): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  // Ensure at least one of each required type
  let password = '';
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly (total length: 20)
  const allChars = lowercase + uppercase + numbers + special;
  for (let i = password.length; i < 20; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

function CompanyRegisterContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    cui: "",
    registrationNumber: "",
    city: "",
    county: "",
    address: "",
    phone: "",
    contactPerson: "",
    // Terms and marketing consent
    acceptTerms: false,
    acceptMarketing: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [isLoadingCompanyData, setIsLoadingCompanyData] = useState(false);
  const [passwordScore, setPasswordScore] = useState(0);
  const [phoneCountry, setPhoneCountry] = useState(countries[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dataAutoCompleted, setDataAutoCompleted] = useState(false); // Track dacă datele au fost completate automat
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set()); // Track câmpuri touched pentru validare
  // Debug state pentru development
  const [debugInfo, setDebugInfo] = useState<{
    cuiRaw?: string;
    cuiNormalized?: string;
    url?: string;
    status?: number;
    statusText?: string;
    responseBody?: string;
    error?: string;
    backendDebug?: any;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        setIsDarkMode(saved === 'true');
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  // Actualizează scorul parolei când utilizatorul tastează
  useEffect(() => {
    setPasswordScore(calculatePasswordScore(formData.password));
  }, [formData.password]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Funcție pentru formatarea numărului de telefon (3 cifre în 3 cifre, max 9 cifre pentru România)
  const formatPhoneNumber = (value: string): string => {
    // Elimină toate caracterele non-digit
    const digits = value.replace(/\D/g, "");
    
    // Limitează la 9 cifre pentru numerele românești
    const limitedDigits = digits.slice(0, 9);
    
    // Grupează cifrele în grupuri de 3
    const groups: string[] = [];
    for (let i = 0; i < limitedDigits.length; i += 3) {
      groups.push(limitedDigits.slice(i, i + 3));
    }
    
    // Returnează numărul formatat cu spații între grupuri
    return groups.join(" ");
  };

  // Set default prefix pentru telefon la înregistrare
  useEffect(() => {
    setPhoneCountry(countries[0]);
    setPhoneNumber("");
    setFormData((prev) => ({ ...prev, phone: countries[0].dialCode }));
  }, []);

  // Actualizează formData.phone când se schimbă country/number
  useEffect(() => {
    const digits = phoneNumber.replace(/\D/g, "");
    const normalized = digits ? `${phoneCountry.dialCode}${digits}` : phoneCountry.dialCode;
    setFormData((prev) => ({ ...prev, phone: normalized }));
  }, [phoneCountry, phoneNumber]);

  // Căutare automată a datelor firmei după CUI folosind ANAF
  const handleCompanyLookup = async (e?: React.MouseEvent) => {
    // Previne submit-ul formularului dacă este apelat din context de form
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Validează că există CUI
    if (!formData.cui || !formData.cui.trim()) {
      setMessage({ type: 'error', text: 'Introdu CUI-ul firmei pentru căutare automată' });
      return;
    }

    const cuiRaw = formData.cui.trim();
    const cuiNormalized = cuiRaw.replace(/\D/g, ''); // Extrage doar cifrele
    const apiUrl = '/api/company/anaf';

    console.log('═══════════════════════════════════════════════════════');
    console.log('[Frontend] 🔍 Company lookup triggered');
    console.log('[Frontend] CUI raw:', cuiRaw);
    console.log('[Frontend] CUI normalized (digits only):', cuiNormalized);
    console.log('[Frontend] URL apelat:', apiUrl);
    console.log('═══════════════════════════════════════════════════════');

    setIsLoadingCompanyData(true);
    setMessage(null); // Clear previous messages
    setDebugInfo({
      cuiRaw,
      cuiNormalized,
      url: apiUrl
    });

    try {
      console.log('[Frontend] 📤 Sending POST request to:', apiUrl);
      console.log('[Frontend] Payload:', JSON.stringify({ cui: cuiRaw }));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cui: cuiRaw
        }),
      });

      console.log('[Frontend] 📥 Response received');
      console.log('[Frontend] Status:', response.status, response.statusText);
      console.log('[Frontend] Headers:', Object.fromEntries(response.headers.entries()));

      // Citește body-ul ca text PRIMA DATĂ pentru debug
      const responseText = await response.text();
      console.log('[Frontend] Response body (raw text, first 1000 chars):', responseText.substring(0, 1000));
      
      // Update debug info
      setDebugInfo(prev => ({
        ...prev,
        status: response.status,
        statusText: response.statusText,
        responseBody: responseText.substring(0, 2000) // Primele 2000 caractere pentru debug
      }));

      // Încearcă să parseze JSON
      let responseData: any;
      try {
        responseData = JSON.parse(responseText);
        console.log('[Frontend] Response parsed as JSON:', responseData);
        
        // Dacă există câmp debug în răspuns (doar în dev), loghează-l
        if (responseData.debug && process.env.NODE_ENV !== 'production') {
          console.log('[Frontend] 🔧 Backend debug info:', responseData.debug);
          setDebugInfo(prev => ({
            ...prev,
            backendDebug: responseData.debug
          }));
        }
      } catch (parseError) {
        console.error('[Frontend] ❌ Failed to parse response as JSON:', parseError);
        console.error('[Frontend] Response text was:', responseText);
        setMessage({ type: 'error', text: 'Răspuns invalid de la server (nu este JSON valid)' });
        setDebugInfo(prev => ({
          ...prev,
          error: `JSON parse error: ${parseError}`
        }));
        setIsLoadingCompanyData(false);
        return;
      }

      // Handle different response statuses
      if (response.status === 400) {
        setMessage({ type: 'error', text: responseData.error || 'CUI invalid' });
        setIsLoadingCompanyData(false);
        return;
      }

      if (response.status === 401 || response.status === 403) {
        setMessage({ type: 'error', text: responseData.error || 'Acces ANAF blocat / neautorizat' });
        setIsLoadingCompanyData(false);
        return;
      }

      if (response.status === 404) {
        // Verifică dacă este "nu găsește" sau alt tip de 404
        setMessage({ type: 'error', text: responseData.error || 'Firma nu a fost găsită' });
        setIsLoadingCompanyData(false);
        return;
      }

      if (response.status === 429) {
        setMessage({ type: 'error', text: responseData.error || 'Prea multe cereri. Te rugăm să încerci din nou peste un minut.' });
        setIsLoadingCompanyData(false);
        return;
      }

      if (response.status >= 500) {
        // 503, 502, 500 - serviciu indisponibil
        setMessage({ type: 'error', text: responseData.error || 'Serviciu ANAF indisponibil. Te rugăm să încerci din nou.' });
        setIsLoadingCompanyData(false);
        return;
      }

      if (!response.ok) {
        setMessage({ type: 'error', text: responseData.error || `Eroare la căutarea datelor firmei (${response.status})` });
        setIsLoadingCompanyData(false);
        return;
      }

      // Răspuns OK - procesează datele
      const companyData = responseData;
      console.log('[Frontend] ✅ Received company data:', companyData);

      // Verifică dacă avem date valide
      if (!companyData) {
        setMessage({ type: 'error', text: 'Datele primite nu sunt valide' });
        setIsLoadingCompanyData(false);
        return;
      }

      // Dacă există mesaj, îl vom afișa după completare
      const infoMessage = companyData.message;

      // Completează automat câmpurile doar dacă există date valide
      // IMPORTANT: Doar la acțiunea de autocompletare (click pe buton) se completează câmpurile
      // Păstrează câmpurile de contact/email/parolă
      const updatedData = {
        ...formData,
        // Completează doar câmpurile de companie (NU suprascrie dacă sunt goale datele de la ANAF)
        companyName: companyData.denumire?.trim() || formData.companyName,
        cui: companyData.cui?.trim() || formData.cui,
        registrationNumber: companyData.nrRegCom?.trim() || formData.registrationNumber,
        city: companyData.localitate?.trim() || formData.city,
        county: companyData.judet?.trim() || formData.county,
        address: companyData.adresa?.trim() || formData.address,
        // Păstrează câmpurile de user (nu le suprascrie)
        // email, password, confirmPassword, phone, contactPerson, acceptTerms, acceptMarketing rămân neschimbate
      };
      
      console.log('[Frontend] ✅ Updating form data:', updatedData);
      setFormData(updatedData);
      
      // Marchează că datele au fost completate automat cu succes
      // Verifică dacă avem date valide completate (denumire sau alte date)
      if (companyData.denumire?.trim() || companyData.adresa?.trim() || companyData.localitate?.trim() || companyData.nrRegCom?.trim()) {
        setDataAutoCompleted(true); // Ascunde butonul după autocompletare reușită
      }
      
      // Mesaj diferit în funcție de ce date au fost găsite
      // Prioritate: mesaj din server > mesaj generat local
      if (infoMessage) {
        setMessage({ type: 'info', text: infoMessage });
      } else if (companyData.cui && companyData.denumire && (companyData.adresa || companyData.localitate)) {
        setMessage({ type: 'success', text: 'Datele firmei au fost completate automat!' });
      } else {
        setMessage({ type: 'success', text: 'Datele firmei au fost actualizate!' });
      }
      
      setDebugInfo(null); // Clear debug on success
      
    } catch (error: any) {
      console.error('[Frontend] ❌ Company Lookup Error:', error);
      console.error('[Frontend] Error name:', error.name);
      console.error('[Frontend] Error message:', error.message);
      console.error('[Frontend] Error stack:', error.stack);
      
      setDebugInfo(prev => ({
        ...prev,
        error: `${error.name}: ${error.message}`
      }));
      
      setMessage({ 
        type: 'error', 
        text: error.message || 'Eroare serviciu, încearcă din nou' 
      });
    } finally {
      setIsLoadingCompanyData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    // Marchează toate câmpurile obligatorii ca touched când utilizatorul încearcă să trimită
    setTouchedFields(new Set(['acceptTerms']));

    try {
      if (formData.password !== formData.confirmPassword) {
        setMessage({ type: "error", text: "Parolele nu coincid." });
        setIsSubmitting(false);
        return;
      }

      // Validare parolă puternică (toate cerințele obligatorii)
      if (formData.password) {
        const allMet = PASSWORD_REQUIREMENTS.every((req) => req.test(formData.password));
        if (!allMet) {
          setMessage({
            type: "error",
            text: "Parola trebuie să îndeplinească toate cerințele: minim 10 caractere, litere mici și mari, cifre și caractere speciale."
          });
          setIsSubmitting(false);
          return;
        }
      }

      // Validate required checkbox for registration (must be checked)
      if (!formData.acceptTerms) {
        setMessage({ 
          type: "error", 
          text: "Trebuie să accepți Termenii și Condițiile și Politica de confidențialitate pentru a continua înregistrarea." 
        });
        // Scroll to checkbox to ensure visibility
        setTimeout(() => {
          const checkbox = document.getElementById('acceptTerms');
          if (checkbox) {
            checkbox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            checkbox.focus();
          }
        }, 100);
        setIsSubmitting(false);
        return;
      }

      // Validate phone number for Romania (must be 9 digits)
      if (phoneCountry.code === "RO") {
        const phoneDigits = phoneNumber.replace(/\D/g, "");
        if (phoneDigits.length !== 9) {
          setMessage({ type: "error", text: "Numărul de telefon românesc trebuie să aibă exact 9 cifre (ex: 712345678)." });
          setIsSubmitting(false);
          return;
        }
      }

      let normalizedPhone = formData.phone?.trim() || "";
      normalizedPhone = normalizedPhone.replace(/\s+/g, "");
      if (!normalizedPhone.startsWith("+")) {
        normalizedPhone = `+${normalizedPhone}`;
      }
      if (!/^\+\d{8,15}$/.test(normalizedPhone)) {
        setMessage({ type: "error", text: "Te rog introdu un număr de telefon valid (ex: +40 712345678)." });
        setIsSubmitting(false);
        return;
      }

      // Create user
      const createUserResponse = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email.trim(),
            password: formData.password,
            firstName: formData.contactPerson,
            lastName: '',
            phone: normalizedPhone,
            accountType: 'company',
            companyName: formData.companyName,
            cui: formData.cui,
            registrationNumber: formData.registrationNumber,
            city: formData.city,
            county: formData.county,
            address: formData.address,
            // Terms and marketing consent
            acceptTerms: formData.acceptTerms,
            acceptMarketing: formData.acceptMarketing
          }),
      });

      const createUserResult = await createUserResponse.json();

      if (!createUserResult.success || !createUserResult.user) {
        setMessage({ type: "error", text: createUserResult.message || "Înregistrare eșuată." });
        setIsSubmitting(false);
        return;
      }

      setPendingUserId(createUserResult.user.id);

      // 1) Trimite ÎNTÂI codul de verificare (esențial) – apoi newsletter
      try {
        let resendConfig = null;
        if (typeof window !== 'undefined') {
          const savedConfig = localStorage.getItem('resend_config');
          if (savedConfig) {
            try {
              resendConfig = JSON.parse(savedConfig);
            } catch (e) {
              console.error('Error parsing resend_config:', e);
            }
          }
        }

        const verifyRes = await fetch('/api/auth/send-verification-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email.trim(),
            userId: createUserResult.user.id,
            config: resendConfig,
          }),
        });

        const verifyResult = await verifyRes.json();

        if (verifyResult.success) {
          setShowVerificationModal(true);
          setMessage({ type: 'info', text: 'Cod de verificare trimis pe email!' });
        } else {
          setMessage({ type: 'error', text: verifyResult.message || 'Eroare la trimiterea codului de verificare.' });
        }
      } catch (err: any) {
        console.error('Error sending verification code:', err);
        setMessage({ type: 'error', text: 'Eroare la trimiterea codului de verificare.' });
      }

      // 2) Abonare newsletter DUPĂ trimiterea codului (dacă acceptMarketing)
      if (formData.acceptMarketing) {
        try {
          const newsletterResponse = await fetch('/api/newsletter/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: formData.email.trim(),
              name: formData.contactPerson || undefined,
            }),
          });
          if (!newsletterResponse.ok) {
            console.warn('[Company Register] Newsletter subscription failed, but continuing');
          }
        } catch (newsletterError) {
          console.warn('[Company Register] Error subscribing to newsletter:', newsletterError);
        }
      }
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Eroare la înregistrare." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (code: string, markCodeAccepted?: () => void) => {
    try {
      const response = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim(),
          code: code,
          userId: pendingUserId
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Cod invalid');
      }
      markCodeAccepted?.();

      // Sign in user
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email.trim(),
        password: formData.password
      });

      if (error || !data?.session) {
        throw new Error('Eroare la autentificare după verificare.');
      }

      setShowVerificationModal(false);
      if (typeof window !== 'undefined') localStorage.setItem('accountType', 'company');
      const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
      trackGoogleConversion("signup", { dedupeKey: data.session.user.id || "once" });
      router.push('/dashboard/company');
    } catch (error: any) {
      throw error;
    }
  };

  return (
    <div className={`min-h-screen relative overflow-hidden transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700' 
        : 'bg-gradient-to-br from-gray-100 via-gray-50 to-white'
    }`}>
      <UniversalHeader
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      <div className="flex items-center justify-center min-h-[calc(100vh-120px)] py-12">
        <div className="max-w-2xl w-full mx-4">
          <div className="mb-6 flex justify-center">
            <BackButton fallbackHref="/auth/select-type" label="Înapoi" className="shadow-md" />
          </div>
          <div className={`backdrop-blur-lg rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 border ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white/90 border-gray-200'
          }`}>
            <div className={`p-8 text-center border-b ${
              isDarkMode ? 'border-white/20' : 'border-gray-200'
            }`}>
              <div className="flex justify-center mb-6">
                <div className={`w-20 h-20 rounded-full overflow-hidden flex-shrink-0 border-2 shadow-2xl ${
                  isDarkMode ? 'border-white/20' : 'border-gray-200'
                }`}>
                  <Image src="/company%20.png" alt="Cont Firmă" width={80} height={80} className="w-full h-full object-contain p-1.5" />
                </div>
              </div>
              <h2 className={`text-4xl font-bold mb-4 ${
                isDarkMode 
                  ? 'bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent' 
                  : 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-700 bg-clip-text text-transparent'
              }`}>
                Înregistrare Firmă
              </h2>
              <p className={`text-xl max-w-md mx-auto ${
                isDarkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>
                Completează datele firmei pentru a crea contul
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6" noValidate>
              {message && (
                <div className={`p-3 rounded-lg text-sm ${
                  message.type === "error"
                    ? isDarkMode ? "bg-red-500/20 text-red-200" : "bg-red-100 text-red-700"
                    : message.type === "success"
                    ? isDarkMode ? "bg-green-500/20 text-green-200" : "bg-green-100 text-green-700"
                    : isDarkMode ? "bg-blue-500/20 text-blue-200" : "bg-blue-100 text-blue-700"
                }`}>
                  {message.text}
                </div>
              )}

              {/* CUI cu buton completare automată */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  CUI <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    name="cui"
                    value={formData.cui}
                    onChange={(e) => {
                      handleInputChange(e);
                      // Dacă utilizatorul modifică CUI-ul manual, permite din nou autocompletarea
                      if (dataAutoCompleted) {
                        setDataAutoCompleted(false);
                      }
                    }}
                    className={`flex-1 px-4 py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    placeholder="RO12345678"
                    disabled={isLoadingCompanyData}
                  />
                  {/* Buton completare automată - se afișează în permanență, dar dispare după autocompletare reușită */}
                  {!isLoadingCompanyData && !dataAutoCompleted && (
                    <button
                      type="button"
                      onClick={handleCompanyLookup}
                      disabled={!formData.cui?.trim()}
                      className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2 ${
                        !formData.cui?.trim()
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                        {/* Speedometer gauge */}
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C6.477 2 2 6.477 2 12c0 5.523 4.477 10 10 10s10-4.477 10-10c0-5.523-4.477-10-10-10z" />
                        {/* Speed needle pointing right/up-right (fast) */}
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12l6-6" strokeWidth={2.5} />
                        {/* Speed indicator lines */}
                        <path strokeLinecap="round" d="M18.5 5.5l1.5-1.5" strokeWidth={2} />
                        <path strokeLinecap="round" d="M20.5 8.5l1.5-0.5" strokeWidth={1.5} />
                        <path strokeLinecap="round" d="M21 12l1.5 0" strokeWidth={1.5} />
                      </svg>
                      Completează automat
                    </button>
                  )}
                  {/* Loading indicator când se completează */}
                  {isLoadingCompanyData && (
                    <div className={`px-6 py-3 rounded-lg flex items-center gap-2 ${
                      isDarkMode ? 'bg-blue-700/50' : 'bg-blue-100'
                    }`}>
                      <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-blue-700'}`}>
                        Se completează...
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Denumirea Firmei */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Denumirea Firmei <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="Numele firmei"
                  required
                />
              </div>

              {/* Rest of form fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Reg. Comerț
                  </label>
                  <input
                    type="text"
                    name="registrationNumber"
                    value={formData.registrationNumber}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    placeholder="J40/1234/2020"
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Localitate <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    placeholder="București"
                    required
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Județ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="county"
                    value={formData.county}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    placeholder="București"
                    required
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Telefon <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-2 px-2 md:px-3 py-2 md:py-3 rounded-lg border transition-colors text-sm md:text-base ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}>
                      <select
                        value={phoneCountry.code}
                        onChange={(e) => {
                          const found = countries.find(c => c.code === e.target.value);
                          if (found) setPhoneCountry(found);
                        }}
                        className={`appearance-none bg-transparent pr-1 cursor-pointer outline-none text-sm md:text-base ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}
                      >
                        {countries.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.dialCode}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="tel"
                      value={formatPhoneNumber(phoneNumber)}
                      onChange={(e) => {
                        // Păstrează doar cifrele pentru state, formatarea se face în display
                        const digits = e.target.value.replace(/\D/g, "");
                        // Limitează la 9 cifre pentru numerele românești
                        const limitedDigits = digits.slice(0, 9);
                        setPhoneNumber(limitedDigits);
                      }}
                      onBlur={(e) => {
                        // La pierderea focus-ului, formatăm din nou pentru consistență
                        const digits = e.target.value.replace(/\D/g, "");
                        const limitedDigits = digits.slice(0, 9);
                        setPhoneNumber(limitedDigits);
                      }}
                      className={`flex-1 px-3 md:px-4 py-2 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                      }`}
                      placeholder="712 345 678"
                      required
                      maxLength={11} // 9 cifre + 2 spații (maxim "123 456 789")
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Adresa <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="Strada, Număr"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Persoană de Contact <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="contactPerson"
                  value={formData.contactPerson}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="Numele persoanei de contact"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  placeholder="contact@firma.ro"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Parolă <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 pr-24 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                    placeholder="Parola ta"
                    required
                    minLength={10}
                  />
                  <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
                    <button
                      type="button"
                      onClick={() => {
                        const newPassword = generateStrongPassword();
                        setFormData(prev => ({ ...prev, password: newPassword, confirmPassword: newPassword }));
                        setPasswordScore(calculatePasswordScore(newPassword));
                      }}
                      className={`px-2 py-1 rounded transition-colors ${
                        isDarkMode
                          ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10' 
                          : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                      }`}
                      title="Generează parolă puternică"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className={`px-2 py-1 rounded transition-colors ${
                        isDarkMode
                          ? 'text-gray-400 hover:text-gray-300' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      aria-label={showPassword ? "Ascunde parola" : "Afișează parola"}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {showPassword ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        )}
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  </div>
                </div>
                {formData.password.trim().length > 0 && (
                  <div className="mt-2 space-y-1">
                    {PASSWORD_REQUIREMENTS.map((req) => {
                      const met = req.test(formData.password);
                      return (
                        <div key={req.label} className="flex items-center gap-2 text-xs">
                          <span className={met ? "text-green-500" : isDarkMode ? "text-gray-500" : "text-gray-400"}>
                            {met ? (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            )}
                          </span>
                          <span className={met ? (isDarkMode ? "text-green-300" : "text-green-600") : (isDarkMode ? "text-gray-400" : "text-gray-500")}>
                            {req.label}
                          </span>
                        </div>
                      );
                    })}
                    <div className={`text-xs font-semibold mt-2 ${passwordStrengthLabel(passwordScore).color}`}>
                      {passwordStrengthLabel(passwordScore).label}
                    </div>
                    <div className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <span className="mr-1">💡</span>
                      Sugestie: Minim 10 caractere, incluzând litere mici, litere mari, cifre și caractere speciale
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Confirmă Parola <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-3 pr-12 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                    placeholder="Confirmă parola"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className={`absolute inset-y-0 right-0 px-3 flex items-center rounded-r-lg transition-colors ${
                      isDarkMode
                        ? 'text-gray-400 hover:text-gray-300' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                    aria-label={showConfirmPassword ? "Ascunde parola" : "Afișează parola"}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {showConfirmPassword ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      ) : (
                        <>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
                {formData.confirmPassword && formData.confirmPassword !== formData.password && (
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                    Parolele nu coincid.
                  </p>
                )}
              </div>

              {/* Terms and Marketing Checkboxes */}
              <div className="space-y-3">
                {/* Required: Terms and Conditions */}
                <div>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="acceptTerms"
                      name="acceptTerms"
                      checked={formData.acceptTerms}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, acceptTerms: e.target.checked }));
                        // Marchează câmpul ca touched când utilizatorul interacționează cu el
                        setTouchedFields(prev => new Set(prev).add('acceptTerms'));
                        // Clear error message when checkbox is checked
                        if (e.target.checked && message?.type === 'error' && message?.text?.includes('Termenii')) {
                          setMessage(null);
                        }
                      }}
                      onBlur={() => {
                        // Marchează câmpul ca touched când utilizatorul iese din el
                        setTouchedFields(prev => new Set(prev).add('acceptTerms'));
                      }}
                      className={`mt-1 w-5 h-5 rounded border-2 transition-colors cursor-pointer ${
                        isDarkMode
                          ? 'bg-gray-700 border-gray-600 checked:bg-blue-600 checked:border-blue-600'
                          : 'bg-white border-gray-300 checked:bg-blue-600 checked:border-blue-600'
                      } focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                      required
                    />
                    <label htmlFor="acceptTerms" className={`text-sm leading-relaxed cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Prin înregistrare, confirm că accept{' '}
                      <a
                        href="/termeni"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`font-medium underline transition-colors ${
                          isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Termenii și Condițiile
                      </a>{' '}
                      gobid.ro, că am citit{' '}
                      <a
                        href="/politica-confidentialitate"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`font-medium underline transition-colors ${
                          isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Politica de confidențialitate
                      </a>
                      {' '}și că am peste 18 ani.
                      <span className="text-red-500 ml-1">*</span>
                    </label>
                  </div>
                  {!formData.acceptTerms && touchedFields.has('acceptTerms') && (
                    <p className="text-xs text-red-400 mt-2 ml-8">
                      Acest câmp este obligatoriu. Trebuie să accepți Termenii și Condițiile și Politica de confidențialitate pentru a continua.
                    </p>
                  )}
                </div>

                {/* Optional: Marketing Communications */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="acceptMarketing"
                    name="acceptMarketing"
                    checked={formData.acceptMarketing}
                    onChange={(e) => setFormData(prev => ({ ...prev, acceptMarketing: e.target.checked }))}
                    className={`mt-1 w-5 h-5 rounded border-2 transition-colors cursor-pointer ${
                      isDarkMode
                        ? 'bg-gray-700 border-gray-600 checked:bg-blue-600 checked:border-blue-600'
                        : 'bg-white border-gray-300 checked:bg-blue-600 checked:border-blue-600'
                    } focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                  />
                  <label htmlFor="acceptMarketing" className={`text-sm leading-relaxed cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Doresc să primesc oferte personalizate și să fiu primul care află despre ultimele noutăți de la gobid.ro prin e-mail.
                  </label>
                </div>
              </div>

              <ButtonWithIcon
                type="submit"
                disabled={isSubmitting}
                label={isSubmitting ? 'Se înregistrează...' : 'Creează Cont Firmă'}
                className="bg-gradient-to-r from-green-600 via-emerald-600 to-green-600 text-white shadow-xl hover:from-green-700 hover:via-emerald-700 hover:to-green-700 hover:shadow-2xl"
              />

              {/* Toggle Auth Type */}
              <div className="pt-6">
                <div className={`text-center border-t pt-6 ${
                  isDarkMode ? 'border-white/10' : 'border-gray-200'
                }`}>
                  <p className={`text-sm transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Ai deja cont?
                  </p>
                  <a
                    href="/auth"
                    className={`mt-2 font-medium text-sm transition-colors hover:text-yellow-400 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    Autentifică-te aici
                  </a>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Footer – componentă din components/DashboardFooter */}
      <div className="mt-16">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>

      {showVerificationModal && (
        <VerificationCodeModal
          isOpen={showVerificationModal}
          onClose={() => setShowVerificationModal(false)}
          email={formData.email}
          onVerify={handleVerifyCode}
        />
      )}
    </div>
  );
}

export default function CompanyRegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CompanyRegisterContent />
    </Suspense>
  );
}




