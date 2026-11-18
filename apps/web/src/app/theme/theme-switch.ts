import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemePreference, type ThemeChoice } from './theme-preference';

/**
 * Sélecteur de thème de l'en-tête. Un groupe de boutons radio natifs : les flèches passent
 * d'une option à l'autre, et le choix s'applique dès la sélection, sans rechargement.
 */
@Component({
  selector: 'tr-theme-switch',
  templateUrl: './theme-switch.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSwitch {
  protected readonly preference = inject(ThemePreference);
  protected readonly options: { value: ThemeChoice; label: string }[] = [
    { value: 'light', label: 'Clair' },
    { value: 'dark', label: 'Sombre' },
    { value: 'system', label: 'Système' },
  ];

  protected choose(value: ThemeChoice): void {
    this.preference.choose(value);
  }
}
