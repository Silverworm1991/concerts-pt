-- Idempotent: safe to run on every start.
-- Coordinates are approximate (city centres / venue entrances) and will be
-- refined by the geocoding service in Epic 5.

INSERT INTO sources (id, name, kind, base_url) VALUES
  ('ticketline',   'Ticketline',        'scraper', 'https://ticketline.sapo.pt'),
  ('blueticket',   'Blueticket',        'scraper', 'https://www.blueticket.pt'),
  ('bol',          'Bilheteira Online', 'scraper', 'https://www.bol.pt'),
  ('ticketmaster', 'Ticketmaster',      'api',     'https://app.ticketmaster.com'),
  ('eventbrite',   'Eventbrite',        'api',     'https://www.eventbriteapi.com'),
  ('bandsintown',  'Bandsintown',       'api',     'https://rest.bandsintown.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO cities (name, region, latitude, longitude, timezone) VALUES
  ('Lisboa',          'Lisboa',   38.7223,  -9.1393, 'Europe/Lisbon'),
  ('Oeiras',          'Lisboa',   38.6979,  -9.3015, 'Europe/Lisbon'),
  ('Almada',          'Lisboa',   38.6790,  -9.1569, 'Europe/Lisbon'),
  ('Setúbal',         'Lisboa',   38.5244,  -8.8882, 'Europe/Lisbon'),
  ('Porto',           'Norte',    41.1579,  -8.6291, 'Europe/Lisbon'),
  ('Braga',           'Norte',    41.5454,  -8.4265, 'Europe/Lisbon'),
  ('Guimarães',       'Norte',    41.4416,  -8.2918, 'Europe/Lisbon'),
  ('Coimbra',         'Centro',   40.2033,  -8.4103, 'Europe/Lisbon'),
  ('Aveiro',          'Centro',   40.6405,  -8.6538, 'Europe/Lisbon'),
  ('Viseu',           'Centro',   40.6566,  -7.9139, 'Europe/Lisbon'),
  ('Leiria',          'Centro',   39.7437,  -8.8071, 'Europe/Lisbon'),
  ('Évora',           'Alentejo', 38.5714,  -7.9135, 'Europe/Lisbon'),
  ('Faro',            'Algarve',  37.0194,  -7.9304, 'Europe/Lisbon'),
  ('Funchal',         'Madeira',  32.6669, -16.9241, 'Atlantic/Madeira'),
  ('Ponta Delgada',   'Açores',   37.7412, -25.6756, 'Atlantic/Azores')
ON CONFLICT (name_norm, country_code) DO NOTHING;

INSERT INTO venues (name, city_id, latitude, longitude, verified)
SELECT v.name, c.id, v.lat, v.lon, true
FROM (VALUES
  ('MEO Arena',            'lisboa', 38.7685, -9.0945),
  ('Coliseu dos Recreios', 'lisboa', 38.7207, -9.1445),
  ('Casa da Música',       'porto',  41.1589, -8.6306),
  ('Coliseu Porto Ageas',  'porto',  41.1473, -8.6076),
  ('Super Bock Arena',     'porto',  41.1480, -8.6256)
) AS v(name, city_norm, lat, lon)
JOIN cities c ON c.name_norm = v.city_norm AND c.country_code = 'PT'
ON CONFLICT (name_norm, city_id) DO NOTHING;

INSERT INTO venue_aliases (venue_id, alias)
SELECT ve.id, a.alias
FROM (VALUES
  ('meo arena',            'Altice Arena'),
  ('meo arena',            'Pavilhão Atlântico'),
  ('meo arena',            'MEO Arena Lisboa'),
  ('coliseu dos recreios', 'Coliseu de Lisboa'),
  ('casa da musica',       'Casa da Música Porto'),
  ('coliseu porto ageas',  'Coliseu do Porto'),
  ('super bock arena',     'Pavilhão Rosa Mota'),
  ('super bock arena',     'Super Bock Arena - Pavilhão Rosa Mota')
) AS a(venue_norm, alias)
JOIN venues ve ON ve.name_norm = a.venue_norm
ON CONFLICT (venue_id, alias_norm) DO NOTHING;
