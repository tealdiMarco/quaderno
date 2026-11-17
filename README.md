# Quaderno

App per appunti in markdown con disegni a penna, immagini e PDF. Si installa su telefono, iPad e computer e sincronizza tutto con un repository GitHub. Nessun server, nessun build: sono file statici.

## Cosa fa

- Editor markdown con anteprima, checklist cliccabili, tabelle, codice
- Cartelle (il percorso del file), tag (`#tag`), collegamenti tra note (`[[Nome nota]]`) con elenco "Collegata da"
- Ricerca nel testo di tutte le note
- **Disegni a mano tra il testo**, con Apple Pencil (pressione, rifiuto del palmo), evidenziatore, gomma, forme raddrizzate, selezione col lazo, annulla e ripeti
- **Immagini e PDF nella nota**: il PDF si sfoglia pagina per pagina e puoi annotare sia le pagine sia le immagini a penna. L'originale non viene mai modificato
- Funziona offline: note, disegni e allegati stanno sul dispositivo e si sincronizzano quando torna la rete
- Importa singoli file o un'intera cartella (anche un vault Obsidian: note, immagini e PDF; le cartelle che iniziano con `.` vengono ignorate)
- Tema chiaro e scuro automatico

## Come si usano disegni, immagini e PDF

- **Nuovo disegno**: in modalità "Markdown" tocca la penna nella barra in basso; in "Anteprima" usa "Aggiungi disegno" a fine nota. Il blocco compare nel punto in cui si trovava il cursore e si apre subito in disegno.
- **Disegnare di nuovo su un blocco**: in anteprima tocca "Disegna" sul blocco. La barra scura in basso ha penna, evidenziatore, gomma, forme, selezione, 5 colori, spessore, dito, annulla, ripeti e "Fine".
- **Forme raddrizzate**: con la penna, tieni fermo il Pencil a fine tratto e linee, triangoli, rettangoli ed ellissi si correggono da soli. Con lo strumento "forme" si correggono appena stacchi il Pencil.
- **Dito**: di default il dito scorre la pagina e solo il Pencil disegna. Su telefono o senza Pencil attiva l'icona della mano nella barra per disegnare col dito.
- **PDF e immagini**: "Aggiungi PDF o immagine" (o la graffetta nella barra del Markdown). Poi "Annota" per scriverci sopra. Le foto JPEG molto grandi vengono ridotte a 2400 px per non appesantire il repository.
- Puoi anche scrivere gli allegati a mano: `![testo](Nota.assets/file.pdf)` oppure, stile Obsidian, `![[file.pdf]]`.

## Come sono salvati i file

Tutto è nel tuo repository, accanto alla nota, in file normali:

- `Nota.md` è il testo, con righe come `![Disegno](Nota.assets/disegno-ab12c.svg)`
- `Nota.assets/` contiene i disegni (`.svg`), le immagini e i PDF allegati
- Le annotazioni stanno in file separati: `foto.jpg.ink.svg` per le immagini, `dispensa.pdf.p3.ink.svg` per la pagina 3 di un PDF
- I disegni `.svg` si aprono anche fuori da Quaderno (browser, Anteprima, Obsidian) e si possono riaprire e modificare in Quaderno
- Se rinomini o elimini una nota, la sua cartella `.assets` la segue

## Messa online (una volta sola)

Servono due repository GitHub:

1. **Repository dell'app** (pubblico, per esempio `quaderno`): contiene solo questi file, nessuna nota. Deve essere pubblico perché GitHub Pages gratuito funziona solo così.
2. **Repository degli appunti** (privato, per esempio `appunti`): qui vivono i tuoi file.

Passi:

1. Crea il repository dell'app e carica tutti i file di questa cartella, compresa la cartella `vendor` (Add file, Upload files; se la cartella non si carica trascinala per intero nella pagina).
2. Nel repository dell'app vai su Settings, Pages, e come sorgente scegli "Deploy from a branch", branch `main`, cartella `/ (root)`. Dopo un minuto l'app è su `https://TUO-UTENTE.github.io/quaderno/`.
3. Crea il repository privato degli appunti (anche vuoto).
4. Crea un token: Settings, Developer settings, Personal access tokens, Fine-grained tokens. Repository access: solo il repo degli appunti. Permissions: Contents su "Read and write".
5. Apri l'app, tocca la scritta in basso a sinistra, inserisci utente, repository, branch e token.

**Su iPad e iPhone**: apri l'indirizzo dell'app in Safari, tocca Condividi e poi "Aggiungi a schermata Home". Su Android: Chrome, "Installa app". Il token va inserito una volta su ogni dispositivo.

## Come funziona la sincronizzazione

- Ogni salvataggio è un commit, quindi hai la cronologia delle versioni su GitHub.
- Parte da sola all'apertura, pochi secondi dopo una modifica, quando torna la rete, o toccando lo stato in basso a sinistra (anche Ctrl/Cmd+S).
- Se la stessa **nota** è stata cambiata sia qui sia su GitHub, la tua versione vince e quella remota viene salvata come "Nome (versione remota)". Per disegni e annotazioni vince la versione dell'ultimo dispositivo che sincronizza.

## Limiti

- Allegati fino a 25 MB ciascuno; formati: PNG, JPG, GIF, WebP, AVIF, BMP, SVG, PDF.
- Il PDF si visualizza e si annota ma non se ne seleziona né cerca il testo, e le annotazioni non vengono "incorporate" nel PDF: restano a parte.
- I disegni non si spostano da soli se cambi il testo sopra: sono blocchi nel punto in cui li hai messi.
- Il token è salvato nel browser di ogni dispositivo. Usa un token limitato al solo repo degli appunti e, se perdi un dispositivo, revocalo da GitHub.
- Rinominare una nota non aggiorna i `[[collegamenti]]` che la citano.
- Non ho potuto provare l'Apple Pencil fisico: pressione, rifiuto del palmo e tocco sono stati verificati con eventi simulati.

## Aggiornare l'app

Dopo aver cambiato un file, modifica il numero di versione in `sw.js` (`quaderno-v3` diventa `quaderno-v4`) così i dispositivi scaricano la versione nuova.

## Licenze

PDF.js (cartella `vendor`) è distribuito con licenza Apache 2.0, vedi `vendor/pdfjs-LICENSE.txt`.


## Novità della versione 4

- **Tema**: il bottone con il sole in alto apre un menu Chiaro / Scuro / Come il dispositivo (la scelta viene ricordata).
- **Sincronizzazione**: ora ha il suo bottone (nuvola) in alto; le impostazioni di GitHub sono nell'icona con i cursori.
- **Barra laterale a scomparsa**: il menu in alto (tre righe) la nasconde, la maniglia sul bordo sinistro (o il trascinamento dal bordo) la riapre sopra la nota e si richiude da sola quando scegli una nota. Il pulsante con la freccia/puntina nella barra la nasconde o la fissa.
- **Affiancati**: Markdown a sinistra e anteprima a destra con aggiornamento in tempo reale, scorrimento sincronizzato e divisore trascinabile (da 700 px di larghezza in su).
- **Colori e spessori**: il bottone con il pallino colorato nella barra del disegno apre un popover con 12 colori, la ruota dei colori (con codice esadecimale e "I miei colori") e lo spessore a cursore (penna 1–20, evidenziatore 6–64).
- **PDF a schermo intero con note per pagina**: nel blocco PDF il pulsante con le quattro frecce apre il lettore con miniature, pagina grande e foglio "Note della pagina N" (testo + disegno). Salvati come `file.pdf.pN.note.txt` e `file.pdf.pN.notes.ink.svg`; un puntino sulle miniature segna le pagine con note.
