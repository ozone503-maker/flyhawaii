import json,sys
D={x['id']:x for x in json.load(open('../../public/destinations/destinations.json'))['destinations']}
# id: (caption, background, pan start 0..1, pan dir, voice pitch Hz)
C={
'flashtown-hq':("Ho, the cats been waiting! Mahalo, here's Kudokens!",'flashtown',0.55,-1,150),
'kona-farmers-market':("Nice flying! Mahalo plenty, take some Kudokens!",'kona',0.2,1,120),
'kona-commons':("Just in time for the drop! Kudokens for you!",'kona',0.75,-1,140),
'keauhou-shopping-center':("Yay, more syrup! Mahalo! Here, Kudokens!",'puuhonua',0.3,1,300),
'volcano-farmers-market':("Oh, my honey jars! Mahalo, dear. Kudokens for you.",'kilauea',0.25,1,230),
'kilauea-lodge':("Kitchen saved! Mahalo, brah. Take these Kudokens!",'kilauea',0.8,-1,130),
'hilo-farmers-market':("Ho, just in time! Mahalo nui, here's Kudokens!",'hilo',0.3,1,240),
'volcano-house':("Over the caldera? Brave! Kudokens for you!",'kilauea',0.5,1,270),
'makuu-farmers-market':("Still warm from the ground! Take some Kudokens!",'mountain-view',0.4,1,110),
'uncle-roberts-awa-club':("Right before the band! Mahalo, here's Kudokens!",'punaluu',0.35,1,280),
'suisan-fish-market':("Ho, still cold! Mahalo, brah. Kudokens for you!",'hilo',0.75,-1,115),
'kens-house-of-pancakes':("Breakfast rush saved! Kudokens for you, sweetheart!",'waipio',0.6,-1,135),
'hana-hou-restaurant':("Hana hou! Mahalo plenty, take some Kudokens!",'south-point',0.4,1,125),
'bamboo-restaurant':("All the way up north! Mahalo, here's Kudokens!",'pololu',0.45,1,140),
'royal-kona-resort':("Right on time! Kudokens, cuz you shred the sky!",'kona',0.45,1,260),
'king-kamehamehas-kona-beach-hotel':("Straight to the beach! Mahalo, here's Kudokens!",'hapuna',0.65,-1,290),
'hilton-waikoloa-village':("Before the boats leave! Kudokens for you!",'hapuna',0.25,1,150),
'mauna-lani':("My orchids still smiling! Kudokens for you, darling.",'akaka',0.5,1,220),
'mauna-kea-beach-hotel':("Smooth landing! Kudokens from one captain to another!",'papakolea',0.5,-1,120),
'four-seasons-resort-hualalai':("Easy over the honu! Mahalo, here's Kudokens!",'punaluu',0.7,-1,300),
}
# moving drop-offs (src/moving-jobs.js): not in destinations.json
D['cruise-ship']={'name':'Cruise ship','local':{'name':'Bosun Kale','portrait':'rope-uncle.webp'}}
D['fishing-boat']={'name':'Fishing boat','local':{'name':'Uncle Sonny','portrait':'hook-uncle.webp'}}
D['snorkel-cat']={'name':'Snorkel catamaran','local':{'name':'Kanoe','portrait':'lei-maker.webp'}}
C['cruise-ship']=("Ho, you caught us under way! Kudokens for you, sailor!",'hilo',0.5,-1,125)
C['fishing-boat']=("Eh, right on the bite! Kudokens, fresh off the boat!",'kona',0.6,1,115)
C['snorkel-cat']=("Aloha from the deck! Mahalo, here's Kudokens!",'puuhonua',0.4,1,260)
out=[]
for k,(cap,bg,px,pd,pitch) in C.items():
    d=D[k]; l=d['local']
    assert '—' not in cap
    out.append(dict(id=k,name=l['name'],biz=d['name'],town=d.get('town',''),portrait=l['portrait'].replace('.webp',''),cap=cap,bg=bg,px=px,pd=pd,pitch=pitch))
json.dump(out,open(sys.argv[1] if len(sys.argv)>1 else 'spec.json','w'),ensure_ascii=False,indent=1); print(len(out))
