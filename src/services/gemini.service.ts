import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
// FIX: Corrected import name from ShoppingOffer to ShopOffer to match the model definition.
import type { InventoryFormInput, InventoryPlanItem, ShoppingPlanItem, ShopOffer } from '../models/inventory-plan.model';

// Definiranje ShoppingItem s Offerima bez webShopUrl za osnovne pozive
type ShoppingItemBase = Omit<ShoppingPlanItem, 'selectedOfferIndex'>;
// Definiranje ShoppingItem s webShopUrl (za finalni plan)
type ShoppingItemWithUrls = ShoppingPlanItem;


@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  // Prilagođena inicijalizacija za Angular.
  // Pretpostavljamo da je API ključ dostupan preko `process.env.API_KEY`.
  private readonly ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Pomoćna shema za response da bi se spriječilo ponavljanje
  private readonly inventoryPlanSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            category: { 
              type: Type.STRING, 
              description: 'Kategorija potrošnog sredstva (npr. "Sredstva za čišćenje kupaonice").' 
            },
            monthlyNeed: { 
              type: Type.STRING, 
              description: 'Procijenjena mjesečna potreba, uključujući jedinicu (npr. "5L").' 
            },
            annualTotal: { 
              type: Type.STRING, 
              description: 'Ukupna godišnja količina, uključujući jedinicu (npr. "60L").' 
            },
            recommendedStock: { 
              type: Type.STRING, 
              description: 'Preporučena zaliha (20% od godišnjeg totala), uključujući jedinicu (npr. "12L").' 
            }
        },
        required: ['category', 'monthlyNeed', 'annualTotal', 'recommendedStock']
    }
  };

  /**
   * Generira Godišnji Plan Nabave i Zaliha Potrošnih Sredstava na temelju ulaznih podataka.
   */
  async generatePlan(inputs: InventoryFormInput): Promise<InventoryPlanItem[]> {
    const systemInstruction = `Persona: Ti si kombinirana ekspertiza dvoje vrhunskih profesionalaca.
1. **Iskusna Glavna Domaćica/Čistačica (10+ god. iskustva):** Specijalizirana za efikasnost, kvalitetu i točnu procjenu potrošnje sredstava za čišćenje i pripremu apartmana i soba.
2. **Voditelj Turističkih Objekata (20+ god. iskustva):** S fokusom na zadovoljstvo gostiju, optimizaciju troškova i praćenje najnovijih trendova u privatnom smještaju i hotelijerstvu.

Cilj: Generirati ultra-realističan i detaljan Godišnji Plan Nabave i Zaliha Potrošnih Sredstava.
Kontekst: Plan mora uzeti u obzir dvije vrste potrošnje:
- **Potrošna sredstva za goste:** Toaletne potrepštine, kava, čaj, šećer, itd., koje gosti troše tijekom boravka. Svaka smještajna jedinica ima vlastitu kupaonicu.
- **Sredstva za čišćenje i održavanje:** Materijali koje osoblje (čistačice) koristi za pripremu i čišćenje jedinica između gostiju.

Izlaz: Tvoj izlaz MORA biti isključivo JSON koji striktno prati zadanu shemu. Bez ikakvog dodatnog teksta, objašnjenja ili markdown formatiranja.
Ton: Analitički, precizan i usmjeren na maksimalnu efikasnost i optimizaciju troškova.`;

    const prompt = `Generiraj plan nabave na temelju sljedećih ulaznih podataka:
- Prosječna Dužina Sezone: ${inputs.seasonLength} dana
- Prosječan broj noćenja po smještajnoj jedinici po sezoni: ${inputs.avgNightsPerUnit}
- Prosječan broj noćenja po rezervaciji: ${inputs.avgNightsPerBooking}
- Ukupna Veličina Objekta: ${inputs.totalArea} m²
- Broj Smještajnih Jedinica: ${inputs.units}
- Prosječna Veličina Jedinice: ${inputs.avgUnitArea} m²
- Broj Čistačica: ${inputs.cleaners}`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: this.inventoryPlanSchema,
        },
      });

      const jsonString = response.text.trim();
      return JSON.parse(jsonString) as InventoryPlanItem[];
    } catch (error: unknown) {
      console.error('Error generating inventory plan:', error);
      this.handleJsonError(error);
    }
  }

  /**
   * Pomoćna funkcija za izvršavanje generiranja Plana Kupovine.
   */
  private async executeShoppingPlanGeneration(prompt: string): Promise<ShoppingItemBase[]> {
     const systemInstruction = `Persona: AI Financijski Optimizator (Supply Chain Focus).
Cilj: Generiranje **Aktivnog Plana Kupovine** analizom stavki iz dostavljenog Plana Nabave.
Ograničenje: Koristi **Google Search** za pronalazak aktualnih cijena i ponuda u Hrvatskoj.
Izlaz: Tvoj izlaz MORA biti isključivo JSON niz objekata, bez dodatnog teksta ili markdowna.
Struktura:
- Svaki objekt predstavlja jednu stavku i mora sadržavati ključeve: "item", "quantity", i "offers".
- Ključ "offers" mora biti NIZ od 1 do 3 ponude, sortiranih po najnižoj cijeni (najbolja ponuda prva).
- Svaki objekt ponude unutar "offers" niza mora sadržavati: "shop", "price" (cijena po komadu/jedinici), "totalCost", i opcionalno "estimatedSavings" (u postotku, npr. "15%").
`;
    
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });
      
      const jsonString = response.text.trim().replace(/```json|```/g, '');
      return JSON.parse(jsonString) as ShoppingItemBase[];

    } catch(error: unknown) {
      console.error('Error generating shopping plan:', error);
      this.handleJsonError(error, true);
    }
  }

  /**
   * Generira inicijalni plan kupovine s ponudama na temelju godišnjeg plana.
   */
  async generateShoppingPlan(plan: InventoryPlanItem[]): Promise<ShoppingItemBase[]> {
    const prompt = `Na temelju sljedećeg godišnjeg plana nabave, generiraj optimizirani plan kupovine s više ponuda za svaku stavku. 
Godišnji plan nabave:
${JSON.stringify(plan, null, 2)}
`;
    return this.executeShoppingPlanGeneration(prompt);
  }

  /**
   * Osvježava cijene za postojeći plan kupovine.
   */
  async refreshShoppingPlanPrices(plan: ShoppingPlanItem[]): Promise<ShoppingItemBase[]> {
    // Stvaranje pojednostavljenog popisa za prompt
    const itemsToRefresh = plan.map(p => ({ item: p.item, quantity: p.quantity }));
    
    const prompt = `Na temelju sljedećeg popisa artikala i količina, generiraj ažurirani i optimizirani plan kupovine s trenutnim cijenama. Pronađi do 3 najbolje ponude za svaki artikl.
Popis:
${JSON.stringify(itemsToRefresh, null, 2)}
`;
    return this.executeShoppingPlanGeneration(prompt);
  }

  /**
   * Pronalazi URL-ove web trgovina za sve jedinstvene trgovine u planu kupovine.
   */
  async findWebShops(plan: ShoppingItemBase[]): Promise<ShoppingItemWithUrls[]> {
    const systemInstruction = `You are a highly efficient web search assistant. Your sole purpose is to find the main website URL for a given list of shops in Croatia.
- Use Google Search to find the most accurate homepage URL for each shop.
- Your output MUST be ONLY a valid JSON array of objects.
- Each object in the array must contain 'shop' and 'webShopUrl'.
- Do not include any text, explanations, or markdown formatting before or after the JSON array.
- If a URL cannot be found for a specific shop, the value for 'webShopUrl' should be an empty string "".

Example Response:
[
  { "shop": "Konzum", "webShopUrl": "https://www.konzum.hr/" },
  { "shop": "dm", "webShopUrl": "https://www.dm.hr/" }
]
`;
    // Izdvajanje jedinstvenog popisa trgovina
    const allShops = plan.flatMap(item => item.offers.map(offer => offer.shop));
    const uniqueShops = [...new Set(allShops)];

    if (uniqueShops.length === 0) {
      return plan as ShoppingItemWithUrls[];
    }

    const prompt = `Based on the following list of shops, find the main website URL for each one:
${JSON.stringify(uniqueShops)}
`;
    
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });

      if (!response.text) {
        throw new Error('AI model returned an empty response. This can happen due to safety filters or network issues.');
      }
      
      const jsonString = response.text.trim().replace(/```json|```/g, '');
      const results: { shop: string; webShopUrl: string }[] = JSON.parse(jsonString);

      // Mapiranje trgovine na URL za brzi dohvat
      const urlMap = new Map(results.map(r => [r.shop, r.webShopUrl]));

      // Ažuriranje plana kupovine s URL-ovima
      const updatedPlan = plan.map(item => ({
        ...item,
        // Dodavanje 'selectedOfferIndex' na 0 jer je to obavezno u ShoppingPlanItem, 
        // a ova funkcija ga ne dohvaća/postavlja
        selectedOfferIndex: (item as ShoppingPlanItem).selectedOfferIndex ?? 0, 
        offers: item.offers.map(offer => ({
          ...offer,
          webShopUrl: urlMap.get(offer.shop) || ''
        // FIX: Corrected type cast from ShoppingOffer to ShopOffer.
        }) as ShopOffer) // Cast na ShopOffer
      })) as ShoppingItemWithUrls[];
      
      return updatedPlan;

    } catch(error: unknown) {
      console.error('Error finding web shops:', error);
      this.handleJsonError(error, false, true);
    }
  }

  /**
   * Centralizirana funkcija za rukovanje greškama.
   * @param error Greška koja se dogodila.
   * @param isShoppingPlanError TRUE ako je iz generiranja plana kupovine.
   * @param isWebShopError TRUE ako je iz pretraživanja web shopova.
   */
  private handleJsonError(error: unknown, isShoppingPlanError: boolean = false, isWebShopError: boolean = false): never {
    let errorMessage = 'Došlo je do neočekivane pogreške.';

    if (isShoppingPlanError) {
      errorMessage = 'Došlo je do neočekivane pogreške prilikom generiranja plana kupovine. Molimo provjerite svoju internetsku vezu i pokušajte ponovo.';
    } else if (isWebShopError) {
       errorMessage = 'Došlo je do neočekivane pogreške prilikom pretraživanja web trgovina.';
    } else {
       errorMessage = 'Došlo je do pogreške prilikom generiranja plana. Molimo provjerite svoju internetsku vezu i pokušajte ponovo. Ako se problem nastavi, ulazni podaci možda nisu dovoljno precizni.';
    }

    if (error instanceof Error) {
      if (error.message.includes('JSON')) {
          errorMessage = 'AI je vratio odgovor u neočekivanom formatu. To se ponekad događa kod složenih upita. Molimo pokušajte generirati plan ponovo.';
      } else if (error.message.includes('400') || error.message.includes('INVALID_ARGUMENT')) {
        errorMessage = 'Zahtjev je neispravan. Provjerite jesu li podaci ispravni i pokušajte ponovo.';
      } else if (!isShoppingPlanError && !isWebShopError) {
         errorMessage = 'Model nije uspio generirati ispravan JSON format. Molimo pokušajte ponovo s malo drugačijim vrijednostima.';
      }
    } else if (typeof error === 'string' && error.includes('JSON')) {
        errorMessage = 'AI je vratio odgovor u neočekivanom formatu. To se ponekad događa kod složenih upita. Molimo pokušajte generirati plan ponovo.';
    }

    throw new Error(errorMessage);
  }
}