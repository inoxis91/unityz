import { Injectable } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  constructor(private titleService: Title, private metaService: Meta) {}

  generateTags(config: { title?: string; description?: string; keywords?: string; image?: string }) {
    const defaultTitle = "Guild Manager - Logiciel de gestion de guilde WoW SaaS";
    const defaultDesc = "La plateforme SaaS ultime pour gérer votre guilde World of Warcraft. Synchronisation Battle.net, rosters dynamiques, calendrier de raids et gestion des cotisations.";
    const defaultImage = "https://guild-manager.com/favicon.ico";
    
    const title = config.title ? `${config.title} | Guild Manager` : defaultTitle;
    const description = config.description || defaultDesc;
    const image = config.image || defaultImage;

    // Set Title
    this.titleService.setTitle(title);

    // Set Meta Description
    this.metaService.updateTag({ name: 'description', content: description });

    // Set Meta Keywords if provided
    if (config.keywords) {
      this.metaService.updateTag({ name: 'keywords', content: config.keywords });
    }

    // Open Graph
    this.metaService.updateTag({ property: 'og:title', content: title });
    this.metaService.updateTag({ property: 'og:description', content: description });
    this.metaService.updateTag({ property: 'og:image', content: image });

    // Twitter Card
    this.metaService.updateTag({ property: 'twitter:title', content: title });
    this.metaService.updateTag({ property: 'twitter:description', content: description });
    this.metaService.updateTag({ property: 'twitter:image', content: image });
  }
}
