import { BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { AppComponent } from './app/app';
import { config } from './app/app.config.server';

registerLocaleData(localeFr, 'fr');

// Used only at build time to prerender the public pages (outputMode: 'static')
const bootstrap = (context: BootstrapContext) =>
  bootstrapApplication(AppComponent, config, context);

export default bootstrap;
