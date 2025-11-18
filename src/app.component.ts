

import { Component, ChangeDetectionStrategy, inject, signal, WritableSignal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { GeminiService } from './services/gemini.service';
import type { InventoryPlanItem, ShoppingPlanItem } from './models/inventory-plan.model';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
})
export class AppComponent {
  private fb = inject(FormBuilder);
  private geminiService = inject(GeminiService);

  plan = signal<InventoryPlanItem[] | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  copySuccess = signal(false);

  shoppingPlan: WritableSignal<ShoppingPlanItem[] | null> = signal(null);
  shoppingPlanLoading = signal(false);
  shoppingPlanError = signal<string | null>(null);
  shoppingPlanRefreshLoading = signal(false);

  inventoryForm = this.fb.group({
    seasonLength: [365, [Validators.required, Validators.min(1)]],
    avgNightsPerUnit: [180, [Validators.required, Validators.min(1)]],
    avgNightsPerBooking: [2, [Validators.required, Validators.min(1)]],
    totalArea: [100, [Validators.required, Validators.min(1)]],
    units: [4, [Validators.required, Validators.min(1)]],
    avgUnitArea: [20, [Validators.required, Validators.min(1)]],
    cleaners: [2, [Validators.required, Validators.min(1)]],
  });

  async onSubmit(): Promise<void> {
    this.inventoryForm.markAllAsTouched();
    if (this.inventoryForm.invalid) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.plan.set(null);
    this.shoppingPlan.set(null); // Reset shopping plan
    this.shoppingPlanError.set(null);

    try {
      const formValue = this.inventoryForm.getRawValue();
      const result = await this.geminiService.generatePlan(formValue as any); // Cast because of TS strictness
      this.plan.set(result);
    } catch (e: any) {
      this.error.set(e.message || 'Nepoznata pogreška.');
    } finally {
      this.loading.set(false);
    }
  }

  async generateShoppingPlan(): Promise<void> {
    const currentPlan = this.plan();
    if (!currentPlan) return;

    this.shoppingPlanLoading.set(true);
    this.shoppingPlanError.set(null);
    this.shoppingPlan.set(null);

    try {
      const planWithoutUrls = await this.geminiService.generateShoppingPlan(currentPlan);
      const planWithOffers = planWithoutUrls.map(item => ({...item, selectedOfferIndex: 0}));

      // Automatically find web shops for the new plan
      const finalPlan = await this.geminiService.findWebShops(planWithOffers);
      
      this.shoppingPlan.set(finalPlan);
    } catch (e: any) {
      this.shoppingPlanError.set(e.message || 'Nepoznata pogreška prilikom generiranja plana kupovine.');
    } finally {
      this.shoppingPlanLoading.set(false);
    }
  }
  
  async refreshShoppingPlanPrices(): Promise<void> {
    const currentPlan = this.shoppingPlan();
    if (!currentPlan) return;

    this.shoppingPlanRefreshLoading.set(true);
    this.shoppingPlanError.set(null);

    try {
      const refreshedPlanWithoutUrls = await this.geminiService.refreshShoppingPlanPrices(currentPlan);
      const planWithOffers = refreshedPlanWithoutUrls.map(item => ({...item, selectedOfferIndex: 0}));

      // Automatically find web shops for the refreshed plan
      const finalPlan = await this.geminiService.findWebShops(planWithOffers);

      this.shoppingPlan.set(finalPlan);
    } catch (e: any) {
      this.shoppingPlanError.set(e.message || 'Greška prilikom osvježavanja cijena.');
    } finally {
      this.shoppingPlanRefreshLoading.set(false);
    }
  }

  selectOffer(itemIndex: number, offerIndex: number): void {
    this.shoppingPlan.update(plan => {
      if (!plan) return null;
      const newPlan = [...plan];
      const itemToUpdate = { ...newPlan[itemIndex] };
      itemToUpdate.selectedOfferIndex = offerIndex;
      newPlan[itemIndex] = itemToUpdate;
      return newPlan;
    });
  }

  copyPlan(): void {
    if (!this.plan()) return;

    const header = "Kategorija\tMjesečna Potreba\tGodišnji Total\tPreporučena Zaliha (20%)\n";
    const rows = this.plan()!.map(item => 
      `${item.category}\t${item.monthlyNeed}\t${item.annualTotal}\t${item.recommendedStock}`
    ).join('\n');
    
    const planText = header + rows;

    navigator.clipboard.writeText(planText).then(() => {
      this.copySuccess.set(true);
      setTimeout(() => this.copySuccess.set(false), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  }

  printPlan(): void {
    const printContent = document.getElementById('plan-output');
    if (printContent) {
      const title = "Godišnji Plan Nabave";
      const headerHtml = `
        <div style="text-align: center; margin-bottom: 1rem;">
          <h1 style="font-size: 1.5rem; font-weight: bold;">${title}</h1>
        </div>
      `;
      const printableContent = headerHtml + printContent.innerHTML;

      const printWindow = window.open('', '', 'height=600,width=800');
      if (printWindow) {
        printWindow.document.write('<html><head><title>Ispis Plana</title>');
        printWindow.document.write('<script src="https://cdn.tailwindcss.com"><\/script>');
        printWindow.document.write('</head><body class="p-8">');
        printWindow.document.write(printableContent);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      }
    }
  }

  downloadPdf(): void {
    if (!this.plan()) return;

    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    
    doc.text("Godišnji Plan Nabave", 14, 16);

    (doc as any).autoTable({
      head: [['Kategorija', 'Mjesečna Potreba', 'Godišnji Total', 'Preporučena Zaliha (20%)']],
      body: this.plan()!.map(item => [
        item.category,
        item.monthlyNeed,
        item.annualTotal,
        item.recommendedStock
      ]),
      startY: 20,
      theme: 'grid',
      styles: { font: 'helvetica' },
      headStyles: { fillColor: [3, 105, 161] }, // sky-600
    });

    doc.save('godisnji-plan-nabave.pdf');
  }

  downloadShoppingPlanPdf(): void {
    if (!this.shoppingPlan()) return;

    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    
    doc.text("Aktivni Plan Kupovine", 14, 16);

    (doc as any).autoTable({
      head: [['Stavka', 'Količina', 'Cijena', 'Trgovina', 'Ukupni Trošak', 'Ušteda']],
      body: this.shoppingPlan()!.map(item => {
        const selectedOffer = item.offers[item.selectedOfferIndex];
        return [
          item.item,
          item.quantity,
          selectedOffer.price,
          selectedOffer.shop,
          selectedOffer.totalCost,
          selectedOffer.estimatedSavings || '-'
        ]
      }),
      startY: 20,
      theme: 'grid',
      styles: { font: 'helvetica' },
      headStyles: { fillColor: [22, 163, 74] }, // green-600
    });

    doc.save('plan-kupovine.pdf');
  }

  getIconForCategory(category: string): string {
    const cat = category.toLowerCase();
    if (cat.includes('čišćenje') || cat.includes('deterdžent') || cat.includes('sredstv')) {
      return 'cleaning';
    }
    if (cat.includes('kupaonic') || cat.includes('toalet') || cat.includes('wc') || cat.includes('sapun') || cat.includes('šampon') || cat.includes('gel')) {
      return 'bathroom';
    }
    if (cat.includes('kuhinj') || cat.includes('kava') || cat.includes('čaj') || cat.includes('šećer') || cat.includes('sol') || cat.includes('ulje') || cat.includes('spužv')) {
      return 'kitchen';
    }
    if (cat.includes('posteljin') || cat.includes('ručnik') || cat.includes('plaht') || cat.includes('krp')) {
      return 'linens';
    }
    return 'default';
  }
}