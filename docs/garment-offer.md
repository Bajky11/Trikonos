# Nabídka oblečení

1. V **Oblečení** má každý typ a střih jednu kartu. Zaškrtněte barvy a velikosti zvlášť: nabídka zahrnuje každou vybranou velikost ve všech vybraných barvách.
2. Každý motiv nabídku přebírá automaticky. V **Motivy → Upravit → Oblečení** můžete odškrtnutím vypnout celý typ se střihem. Rozbalením řádku nastavíte výjimky pro barvy a velikosti. Vypnutí celého řádku jeho výjimky nesmaže. Pokud možnost odeberete ze společné nabídky, její výjimka se označí jako nedostupná; při vrácení možnosti opět platí.
3. Na jednom detailu motivu zákazník vybírá typ, střih, barvu a velikost z výsledné nabídky. Stejnou dostupnost kontroluje i objednávka. Vlastní potisk používá společnou nabídku bez výjimek motivů (jen pro typy s tiskovou plochou). Nejde o evidenci skladu ani živou dostupnost u dodavatele.

## Přechod ze staré nabídky

Databázová migrace `catalog.0005_shared_garment_offer` založí společnou nabídku z dosud aktivních kombinací motivů a z kombinací použitých v objednávkách vlastního potisku. Dříve neobjednané kombinace pro vlastní potisk je potřeba případně doplnit v administraci.

U starších karet, kde některé dvojice barvy a velikosti dosud chyběly, zůstanou vypnuté. Tlačítko **Použít velikosti pro všechny barvy** je doplní až po uložení nabídky.

Migrace `catalog.0007_remove_legacy_motif_offer` odstraní starý režim a ručně zadané kombinace u motivů. Každý motiv pak používá společnou nabídku se svými již uloženými výjimkami. Dřívější objednávky se nemění.

## Automatické náhledy

- V **Motivy → Upravit → Motiv pro automatický náhled** nahrajte jedno PNG s průhledným pozadím. Web automaticky vycentruje motiv a přebarví jen podklad podle vybrané barvy.
- V **Oblečení → Podklad náhledu** lze pro typ a střih nahradit výchozí tričko. Použijte bílé oblečení zepředu na průhledném plátně ve stejném rozložení jako výchozí tričko (1131 × 1390 px). Podklad se uloží samostatně od barev a velikostí a používá se i ve Vlastním potisku.
- Detail vždy začíná automatickým náhledem a volitelné fotografie jsou až za ním. Při změně barvy se galerie vrátí na náhled. Výchozí barvu lze nastavit u motivu v sekci **Oblečení**; pokud není dostupná, detail vybere první dostupnou barvu.
