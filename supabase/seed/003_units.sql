-- Generated from src/data/seed/units.ts

INSERT INTO units (fgis_id, name, symbol) VALUES
  ('42', 'ватт', 'Вт'),
  ('70', 'мегагерц', 'МГц'),
  ('68', 'герц', 'Гц'),
  ('716', 'миллиампер', 'мА'),
  ('58', 'джоуль', 'Дж'),
  ('96', 'секунда', 'с')
ON CONFLICT (fgis_id) DO UPDATE SET name = EXCLUDED.name, symbol = EXCLUDED.symbol;

INSERT INTO unit_conversions (from_symbol, to_symbol, factor) VALUES
  ('кГц', 'Гц', 1000),
  ('МГц', 'Гц', 1000000),
  ('ГГц', 'Гц', 1000000000),
  ('мА', 'А', 0.001),
  ('мВт', 'Вт', 0.001),
  ('кВт', 'Вт', 1000),
  ('мкГр', 'Гр', 0.000001),
  ('мГр', 'Гр', 0.001),
  ('мкЗв/ч', 'Зв/ч', 0.000001),
  ('мЗв/ч', 'Зв/ч', 0.001),
  ('мс', 'с', 0.001)
ON CONFLICT (from_symbol, to_symbol) DO UPDATE SET factor = EXCLUDED.factor;
