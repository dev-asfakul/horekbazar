# MEDIA.md: media sources and rights

Every font, image and other media file the store uses, with its source and licence (docs/LICENSING.md, Motomation `craft/media.md`). Update this file in the same change that adds, replaces or removes media. Status checked on 2026-10-23.

## Inventory (files kept in this repository)

| File or asset | Source URL | License / usage status | Placeholder? | Replace before production? |
|---|---|---|---|---|
| `docs/proposals/admin-a1/` | custom (admin redesign A1 mockups, AI-generated in this project from the storefront design, see docs/ADMIN-REDESIGN-A1.md) | project documentation only; not shipped in the app or the template | no | no |

Fonts, icons and showcase images are listed in their own sections below.

## Fonts (shipped in `public/fonts/v1/`)

| File | Family | Licence | Source / licence file |
|---|---|---|---|
| `noto-sans-bengali-bengali.woff2`, `noto-sans-bengali-latin.woff2`, `noto-sans-bengali-latin-ext.woff2` | Noto Sans Bengali (subsets) | SIL Open Font License 1.1 | https://github.com/notofonts/bengali · `public/fonts/OFL-NotoSansBengali.txt` |
| `google-sans-bengali.woff2`, `google-sans-latin.woff2`, `google-sans-latin-ext.woff2` | Google Sans (subsets, variable 400–700; storefront text face from the redesign) | SIL Open Font License 1.1 | https://github.com/googlefonts/googlesans · `public/fonts/OFL-GoogleSans.txt` (name only; no affiliation with Google) |
| `alkatra-bengali.woff2`, `alkatra-latin.woff2`, `alkatra-latin-ext.woff2` | Alkatra (subsets, variable 400–700; storefront display face from the redesign) | SIL Open Font License 1.1 | https://github.com/suman51284/Alkatra · `public/fonts/OFL-Alkatra.txt` |
| `tiro-bangla-bengali.woff2` | Tiro Bangla (Bengali subset) | SIL Open Font License 1.1 | https://github.com/TiroTypeworks/Indigo · `public/fonts/OFL-TiroBangla.txt` |

OFL allows embedding and redistribution in a commercial template when the licence file travels with the fonts. It does not allow selling the fonts on their own.

## Icons and illustrations

Icons are inline SVG written in this repository (`components/`). No icon library or third-party illustration set is used.

## Brand assets

None yet. There is no logo, favicon or social-sharing (og:image) file: the header shows the store name as text. HorekBazar brand assets are not licensed to buyers (docs/LICENSING.md).

## Product images (showcase database only, not shipped)

The `horekbazar_dev` showcase uses 91 illustrative photos of generic, unbranded item types. They are uploaded to Cloudinary by `scripts/showcase-images.ts` from `catalogue/horekbazar/showcase-images.json` (the source of truth for this table). Each image's rights text is stored on the product image record.

- They illustrate the item type, not the exact product sold. Checkpoint 2 condition 3 (exact-product suitability **and** commercial rights) is **not** met by them, so they are showcase-only.
- `catalogue/` and these images are excluded from the sellable template (docs/LICENSING.md).
- The remaining 53 of the 144 sample products have **no image** (the slot shows the no-image state).
- Banner images: none. Banner placement waits for owner-supplied images with recorded rights.

| Product slug | Title on the source page | Creator | Licence | Provider | Source page |
|---|---|---|---|---|---|
| `miniket-rice` | Short white rice grains are displayed in bulk at a hypermarket in Kozhikode. The smooth, polished grains are a common ri | Bigul Malayi | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/37069274da/ |
| `nazirshail-rice` | Free uncooked rice grain mat | — | CC0 1.0 | rawpixel | https://www.rawpixel.com/image/5922922/photo-image-public-domain-food-free |
| `wheat-atta-packet` | Anjeunbaengi wheat flour 3 | Ajumeoni | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Anjeunbaengi_wheat_flour_3.jpg |
| `maida-packet` | HK food 麵粉 Wheat flour powder 加入雞蛋 with egg October 2025 N13P 01 | SZE XAIMMOOA HONGMIN | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:HK_food_%E9%BA%B5%E7%B2%89_Wheat_flour_powder_%E5%8A%A0%E5%85%A5%E9%9B%9E%E8%9B%8B_with_egg_October_2025_N13P_01.jpg |
| `masoor-dal-small-grain` | Red lentils (1) | Fumikas Sagisavas | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Red_lentils_(1).jpg |
| `masoor-dal-medium-grain` | Red lentils (1) | Fumikas Sagisavas | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Red_lentils_(1).jpg |
| `moong-dal` | Young mung bean sprouts | pics_pd | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Young_mung_bean_sprouts.jpg |
| `chhola-chickpeas` | Chickpeas🫘 | Fumikas Sagisavas | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Chickpeas%F0%9F%AB%98.jpg |
| `mashkalai-dal` | Peeled urad beans | BaluBFA12 | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Peeled_urad_beans.jpg |
| `soybean-oil-bottle` | Butter and Oil - NCI Visuals Online | Bill Branson (photographer) | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Butter_and_Oil_-_NCI_Visuals_Online.jpg |
| `rice-bran-oil-bottle` | Olew rêp Blodyn Aur | Stefanik | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Olew_r%C3%AAp_Blodyn_Aur.jpg |
| `turmeric-powder` | Lakadong Turmeric Powder final product | Trinity Saioo | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Lakadong_Turmeric_Powder_final_product.jpg |
| `cumin-seeds-whole` | Dried cumin seeds | Fumikas Sagisavas | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Dried_cumin_seeds.jpg |
| `cinnamon` | Cinnamon sticks (1) | Fumikas Sagisavas | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Cinnamon_sticks_(1).jpg |
| `cloves` | Cloves | Jorge Barrios | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Cloves.JPG |
| `bay-leaves` | Whole Bay Leaves | Misterneedlemouse | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Whole_Bay_Leaves.jpg |
| `dried-red-chilli-whole` | Dried Korean red chillies | ally j | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Dried_Korean_red_chillies.jpg |
| `black-pepper-whole` | Tellicherry Black Peppercorns | Misterneedlemouse | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Tellicherry_Black_Peppercorns.jpg |
| `dates` | DriedDates | Vicki Nunn | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:DriedDates.JPG |
| `honey` | Antiguan honey products at an exhibition in Saint Lucia | Government of Antigua and Barbuda | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Antiguan_honey_products_at_an_exhibition_in_Saint_Lucia.jpg |
| `chanachur` | Bombaymix | No machine-readable author provided. J.P.Lon~commonswiki assumed (based on copyr | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Bombaymix.jpg |
| `toast-biscuits` | Choipaku Rusk variants | 毒島みるく | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Choipaku_Rusk_variants.jpg |
| `vermicelli-semai` | Longkou Vermicelli 龍口粉絲 | Fumikas Sagisavas | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Longkou_Vermicelli_%E9%BE%8D%E5%8F%A3%E7%B2%89%E7%B5%B2.jpg |
| `instant-noodles-pack-of-4` | Buckwheat instant noodles (1) | Fumikas Sagisavas | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Buckwheat_instant_noodles_(1).jpg |
| `wide-tooth-comb` | Olive harvest combs. Anthidona. Greece | Jebulon | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Olive_harvest_combs._Anthidona._Greece.jpg |
| `toothpaste` | Toothbrush, Toothpaste, Dental Care (571741) | Steve Buissinne, South Africa | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Toothbrush,_Toothpaste,_Dental_Care_(571741).jpg |
| `toothbrush-soft` | Toothbrush x3 20050716 002 | Jonas Bergsten | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Toothbrush_x3_20050716_002.jpg |
| `bath-soap` | A bar of soap | No machine-readable author provided. Lacrimosus assumed (based on copyright clai | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:A_bar_of_soap.jpg |
| `nail-cutter` | Nail clippers silver | BarberJP | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Nail_clippers_silver.JPG |
| `floor-mop-with-handle` | Mop, three different mop handles | Bjornwireen | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Mop,_three_different_mop_handles.jpg |
| `phool-jharu-soft-broom` | Broom, vegetable fibers - Museo Egizio, Turin S 7669 p01 | — | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Broom,_vegetable_fibers_-_Museo_Egizio,_Turin_S_7669_p01.jpg |
| `microfibre-cleaning-cloth-pack-of-3` | Microfibre cloth | Polyesterchen | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Microfibre_cloth.jpg |
| `garbage-bags-medium-30-pcs` | Black garbage bag | Wiki Farazi | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Black_garbage_bag.jpg |
| `aluminium-cooking-pot-dekchi` | Cooking Pot March | Peculiar grace | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Cooking_Pot_March.jpg |
| `stainless-steel-ladle-set` | Ladle MET 136401 | — | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Ladle_MET_136401.jpg |
| `chopping-board` | 11. place vegetables on cutting board | Datariumrex | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:11._place_vegetables_on_cutting_board.jpg |
| `kitchen-knife` | Butcher knife | Jpogi at en.wikipedia | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Butcher_knife.JPG |
| `spice-container-set` | Spice box with original contents, undated - Bennington Museum - Bennington, VT - DSC08661 | Daderot | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Spice_box_with_original_contents,_undated_-_Bennington_Museum_-_Bennington,_VT_-_DSC08661.JPG |
| `stainless-steel-water-bottle` | Metal Water Bottles | Amraepowell | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Metal_Water_Bottles.jpeg |
| `glass-tumblers-set-of-6` | Drinking glasses 001 | Albertyanks - Albert Jankowski | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Drinking_glasses_001.JPG |
| `plastic-water-jug` | Water jug | Antonio Borrillo | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Water_jug.JPG |
| `cotton-bath-towel` | Towel blue decorativepattern closeup | User Mike1024 on en.wikipedia | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Towel_blue_decorativepattern_closeup.jpg |
| `storage-basket` | Large Oval Storage Basket MET 36.3.57a-b EGDP011891 | — | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Large_Oval_Storage_Basket_MET_36.3.57a-b_EGDP011891.jpg |
| `wall-clock` | Antique wall clock | Amitbalani | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Antique_wall_clock.jpg |
| `clothes-hangers-set-of-12` | Clothes hangers on railing (Unsplash) | Christian Fregnan christianfregnan | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Clothes_hangers_on_railing_(Unsplash).jpg |
| `rechargeable-table-fan` | Electric Fan 240x355 | Rfc1394(talk) | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Electric_Fan_240x355.jpg |
| `baby-feeding-bottle` | Calf feeding bottle (Components Side-by-Side) | ELTORO.VET | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Calf_feeding_bottle_(Components_Side-by-Side).jpg |
| `white-writing-paper-1-dista` | Scattered white paper (Unsplash) | Brandi Redd brandi1 | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Scattered_white_paper_(Unsplash).jpg |
| `exercise-khata-pack-of-5` | Small blue notepad - 8 x 11 cm - D | Fructibus | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Small_blue_notepad_-_8_x_11_cm_-_D.jpg |
| `stapler-with-pins` | Black Stapler 2024 | DifrancoBarnes | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Black_Stapler_2024.jpg |
| `colour-pencils-12-colours` | Colored pencils lined up on pink surface | Artsy Crafty | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Colored_pencils_lined_up_on_pink_surface.jpg |
| `medium-rice-paijam-brri-28` | An open bag filled with uncooked short-grain rice, showing pale grains against a white interior. | Tawhid Sadman | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/68469889dd/ |
| `coarse-rice-swarna` | A close-up of golden-brown rice grains forming natural wavy patterns. | appealdahal | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/868696b43a/ |
| `chinigura-aromatic-rice` | A person’s hand holding a pile of double-boiled Kuruva rice, a type of rice known for its nutritional value and non-stic | Bigul Malayi | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/50268490fe/ |
| `anchor-dal-split-peas` | Goya yellow split peas | Mx. Granger | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Goya_yellow_split_peas.jpg |
| `masoor-dal-bold-grain` | Red lentils (1) | Fumikas Sagisavas | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Red_lentils_(1).jpg |
| `green-cardamom-small` | Fresh green cardamom pods are displayed in bulk at a hypermarket in Kozhikode. The neat pile of aromatic pods shows thei | Bigul Malayi | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/8669274741/ |
| `black-tea-loose-leaf` | Loose leaf darjeeling tea twinings | Mike1024 | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Loose_leaf_darjeeling_tea_twinings.jpg |
| `peanuts-roasted` | A white ceramic bowl filled with roasted, salted peanuts with their reddish-brown skins partially attached, resting on a | Mohammed Kateregga | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/3726a27dde/ |
| `moisturising-body-lotion` | Aftersun lotion bottle | Craiyon (DALL-E mini) | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Aftersun_lotion_bottle.webp |
| `disposable-razors-pack-of-5` | Bic razor | Mx. Granger | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Bic_razor.jpg |
| `detergent-powder` | Pralni prašek | Uncy at Slovenian Wikipedia | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Pralni_pra%C5%A1ek.JPG |
| `tea-cups-with-saucers-set-of-6` | A close-up, high-angle view of a hot milky drink in a patterned teacup on a white floral saucer, placed on a dark wooden | Tilak Bahadur Karki | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/966a181338/ |
| `cotton-bed-sheet-set` | A hotel room, featuring a bed with a wooden headboard and white bedding, including a comforter and pillows. | Bigul Malayi | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/5568af8767/ |
| `cotton-gamchha` | Gamucha | Abha S Pradhan | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Gamucha.jpeg |
| `casual-cotton-shirt` | Premium Pure Cotton Shirts and Trousers for Men | Prashasya07 | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Premium_Pure_Cotton_Shirts_and_Trousers_for_Men.jpg |
| `printed-cotton-saree` | Two female wearing red sarees and red slippers, flaunting their feet, standing on the dried grass ground. One of them is | Sumi Subedi | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/97868d3cca/ |
| `cotton-orna-dupatta` | Stacks of brightly colored, rolled-up scarves (commonly known as dupattas or shawls) are neatly displayed at a roadside  | Bigul Malayi | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/3196a46b98/ |
| `mens-rubber-sandal` | A sandy beach scene featuring two pairs of flip-flops—one white and one dark blue—scattered on the soft sand. | stevenchacon06 | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/6516a6817a/ |
| `womens-flat-sandal` | Top-down view of someone wearing a yellow-and-white striped dress and black floral flat sandals, standing on a tiled flo | Alina Kakshapati | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/3416abf622/ |
| `everyday-backpack` | A black backpack is placed on green grass. It has a sleek, modern design, with a front pocket that appears slightly unzi | Iyundhu Kennedy | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/6206a73222/ |
| `mens-wallet` | A black leather wallet is placed on a light-colored surface. | Rashed Hossain | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/2036a1d3e5/ |
| `usb-c-charging-cable` | USB-C cable 2017 A | Fructibus | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:USB-C_cable_2017_A.jpg |
| `micro-usb-charging-cable` | Usb connectors | Viljo Viitanen | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Usb_connectors.JPG |
| `school-bag` | School Bags | Saurabh Mention | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/20764bce52/ |
| `kids-water-bottle` | A purple water bottle on a white desk, near a computer monitor, notebooks, a small plant, and a face mask. | Rashed Hossain | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/9276a1d3e0/ |
| `pencils-pack-of-12` | A top-down view of sharpened colored pencils in a radial bundle, forming a bright starburst on a clean white background. | Orianna Radomile | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/28769c130d/ |
| `eraser-and-sharpener-set` | Eraser shreddings | Pixabay | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Eraser_shreddings.jpg |
| `wired-earphones-3-5-mm` | A high-angle close-up of a pair of tangled black wired earphones lying on a closed, silver-gray lid of a laptop. The lap | Enaan Farhan | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/72768e7a1e/ |
| `date-molasses-khejur-gur` | Nolen gur, known as new jaggery or Palm sugar, from Kakdwip, West Bengal, India | Billjones94 | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Nolen_gur,_known_as_new_jaggery_or_Palm_sugar,_from_Kakdwip,_West_Bengal,_India.jpg |
| `lip-balm` | EOS lip balm 6 | W.carter | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:EOS_lip_balm_6.jpg |
| `coconut-hair-oil` | ROGANE-NARGIL | Dana Tentis | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:ROGANE-NARGIL.jpg |
| `hand-wash-refill` | Blue liquid soap in a plastic dispenser 1 | Ser Amantio di Nicolao | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Blue_liquid_soap_in_a_plastic_dispenser_1.jpg |
| `non-stick-fry-pan` | Sarten teflon | MdeVicente | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Sarten_teflon.JPG |
| `pressure-cooker` | Pressure cooker2 | Ashish Bhatnagar | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Pressure_cooker2.JPG |
| `round-neck-cotton-t-shirt` | Young North Indian man with beard in white t-shirt | Singhjayreena | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Young_North_Indian_man_with_beard_in_white_t-shirt.jpg |
| `folding-umbrella` | A hand holding a black umbrella from underneath, showing the interior structure with ribs and fabric. | Faisal Ahammad | CC0 1.0 | wordpress | https://wordpress.org/photos/photo/42568ca7f8/ |
| `led-bulb-b22` | Led light bulb | Beendy234 | CC0 | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Led_light_bulb.jpg |
| `extension-board-4-sockets` | MultiWay side | Deucharman at en.wikipedia | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:MultiWay_side.jpg |
| `baby-diaper-pants` | Disposablediaper | Coop41 | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Disposablediaper.JPG |
| `ballpoint-pens-pack-of-10` | Typical ball point pen | Ronggy | Public domain | Wikimedia Commons | https://commons.wikimedia.org/wiki/File:Typical_ball_point_pen.jpg |

## Open items

- Owner-supplied product photos and banners with recorded rights: **[NEEDS OWNER]**.
- A legal review of whether CC0 and public-domain-mark photos from these providers need any credit line in the storefront (not required by CC0 or PDM; recorded here anyway).
