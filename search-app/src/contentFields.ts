/** Pokemon character content field API names -- must match fields created in Coveo Admin for the pokedex-push source. */
export const CONTENT_FIELDS = {
  name: 'pokemonname',
  number: 'pokemonnumber',
  type: 'pokemontype',
  generation: 'pokemongeneration',
  image: 'pokemonimage',
  galleryImages: 'pokemongalleryimages',
  species: 'pokemonspecies',
  height: 'pokemonheight',
  weight: 'pokemonweight',
  abilities: 'pokemonabilities',
  stats: 'pokemonstats',
  weaknesses: 'pokemonweaknesses',
  evolution: 'pokemonevolution',
  flavorText: 'pokemonflavortext',
  description: 'pokemondescription',
} as const;
