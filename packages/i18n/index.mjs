/** AB-093: Spanish navigation around verified original-language legislation. */
import {validatePublishedReaderPack,publicBillLink} from '../ui/reader/index.mjs';
export class LocaleError extends Error{constructor(code){super(code);this.name='LocaleError';this.code=code;}}
const deny=c=>{throw new LocaleError(c)};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const catalogs=Object.freeze({
 en:Object.freeze({source:'Original legal text',untranslated:'No legal translation is provided; the original source remains authoritative.',status:'Document status',contents:'Contents',full:'Complete source',warning:'Publication does not establish that this version is currently effective law.'}),
 es:Object.freeze({source:'Texto legal original',untranslated:'No se proporciona traducción jurídica; el texto original sigue siendo la fuente de referencia.',status:'Estado del documento',contents:'Contenido',full:'Texto completo de la fuente',warning:'La publicación no demuestra que esta versión sea una ley actualmente vigente.'})
});
export function uiLabels(locale){
 if(locale!=='en'&&locale!=='es')deny('UNSUPPORTED_INTERFACE_LOCALE');
 return catalogs[locale];
}
/** A translated interface MUST NOT silently translate or modify statutory text. */
export function renderSpanishSourceReader(pack){
 let p;try{p=validatePublishedReaderPack(pack);}catch{deny('COMPLETE_PUBLIC_SOURCE_REQUIRED');}
 const l=uiLabels('es'),base=publicBillLink({billId:p.billId,versionId:p.versionId});
 const index=p.provisions.map(s=>'<li><a href="#provision-'+esc(s.id)+'">'+esc(s.heading)+'</a></li>').join('');
 const sections=p.provisions.map(s=>'<section id="provision-'+esc(s.id)+'" data-source-version="'+esc(p.versionId)+
   '" data-provision-id="'+esc(s.id)+'" tabindex="-1"><h2>'+esc(s.heading)+'</h2>'+
   '<pre class="statutory-text" lang="'+esc(p.language)+'">'+esc(s.text)+'</pre>'+
   '<p><a href="'+esc(publicBillLink({billId:p.billId,versionId:p.versionId,provisionId:s.id}))+'">Ver pasaje original</a></p></section>').join('');
 const official=p.sourceUrl?'<a rel="noopener noreferrer" href="'+esc(p.sourceUrl)+'">Fuente oficial</a>':
   'No se ha registrado un enlace oficial';
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
 '<meta name="robots" content="noindex"><title>'+esc(p.title)+' — Ask Bill en español</title><link rel="stylesheet" href="/public-reader.css"></head><body>'+
 '<a href="#reader">Ir al texto legal</a><header><strong>Ask Bill — navegación en español</strong></header>'+
 '<main id="reader"><h1>'+esc(p.title)+'</h1><p role="status">'+esc(l.status)+': <strong>'+esc(p.status)+
 '</strong>. '+esc(l.warning)+'</p><p>'+esc(l.untranslated)+'</p><p>Versión '+esc(p.versionId)+
 ' · Consultado '+esc(p.retrievedAt)+' · Publicado '+esc(p.publishedAt)+'</p><p>'+official+'</p>'+
 '<nav aria-label="'+esc(l.contents)+'"><h2>'+esc(l.contents)+'</h2><ol>'+index+'</ol></nav>'+
 '<article aria-label="'+esc(l.source)+'">'+sections+'</article><p><a href="'+esc(base)+'">Volver al '+esc(l.full)+'</a></p></main>'+
 '<footer>Ask Bill es un sitio independiente; no presta asesoramiento legal ni es un portal gubernamental.</footer></body></html>';
}
