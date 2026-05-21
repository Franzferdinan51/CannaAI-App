import { useState, useEffect, useCallback } from 'react';
import type { Strain } from '../types';
import {
  fetchAllStrains,
  searchStrainsByName,
  fetchStrainsByEffect,
  fetchAllEffects,
  filterStrains,
  addStrain,
  deleteCustomStrain,
} from '../services/strains';

const EMPTY_FORM = {
  name: '',
  type: 'hybrid' as Strain['type'],
  thc: '',
  cbd: '',
  floweringTime: '',
  yield: '',
  difficulty: 'moderate' as Strain['difficulty'],
  effects: [] as string[],
  flavors: [] as string[],
  medicalUses: [] as string[],
  description: '',
  growTips: [] as string[],
};

export function StrainLibrary() {
  const [allStrains, setAllStrains] = useState<Strain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [effectFilter, setEffectFilter] = useState('');
  const [availableEffects, setAvailableEffects] = useState<string[]>([]);
  const [selectedStrain, setSelectedStrain] = useState<Strain | null>(null);

  // Add strain modal state
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [tagField, setTagField] = useState<'effects' | 'flavors' | 'medicalUses' | 'growTips'>('effects');
  const [saving, setSaving] = useState(false);

  const loadStrains = useCallback(() => {
    setLoading(true);
    fetchAllStrains()
      .then(setAllStrains)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load strains'))
      .finally(() => setLoading(false));
  }, []);

  // Load all strains on mount
  useEffect(() => { loadStrains(); }, [loadStrains]);

  // Load effects list on mount
  useEffect(() => {
    fetchAllEffects()
      .then(setAvailableEffects)
      .catch(() => {});
  }, []);

  // Handle search by name
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadStrains();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setAllStrains(await searchStrainsByName(searchQuery));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, loadStrains]);

  // Handle effect filter
  const handleEffectFilter = useCallback(async (effect: string) => {
    setEffectFilter(effect);
    if (!effect) { loadStrains(); return; }
    setLoading(true);
    setError(null);
    try {
      setAllStrains(await fetchStrainsByEffect(effect));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Filter failed');
    } finally {
      setLoading(false);
    }
  }, [loadStrains]);

  // Add a tag to a form field
  const addTag = () => {
    const val = tagInput.trim();
    if (!val) return;
    if (formData[tagField].includes(val)) { setTagInput(''); return; }
    setFormData({ ...formData, [tagField]: [...formData[tagField], val] });
    setTagInput('');
  };

  // Remove a tag
  const removeTag = (field: typeof tagField, value: string) => {
    setFormData({ ...formData, [field]: formData[field].filter((t) => t !== value) });
  };

  // Submit the form
  const handleAddStrain = async () => {
    if (!formData.name.trim() || !formData.description.trim()) return;
    setSaving(true);
    try {
      await addStrain(formData);
      setShowAddForm(false);
      setFormData(EMPTY_FORM);
      loadStrains();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add strain');
    } finally {
      setSaving(false);
    }
  };

  // Delete a custom strain
  const handleDelete = async (id: string) => {
    await deleteCustomStrain(id);
    if (selectedStrain?.id === id) setSelectedStrain(null);
    loadStrains();
  };

  // Apply local filters for display
  const displayStrains = typeFilter !== 'all'
    ? filterStrains(allStrains, { type: typeFilter })
    : allStrains;

  const typeColor = (type: string) => {
    switch (type) {
      case 'indica': return 'badge-purple';
      case 'sativa': return 'badge-yellow';
      case 'hybrid': return 'badge-green';
      case 'hemp': return 'badge-blue';
      case 'ruderalis': return 'badge-gray';
      default: return 'badge-gray';
    }
  };

  const isCustom = (id: string) => id.startsWith('custom-');

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>Strain Library</h2>
          <p>Browse {allStrains.length} cannabis strains.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddForm(true)}>
          + Add Strain
        </button>
      </div>

      {/* Add Strain Modal */}
      {showAddForm && (
        <div className="card" style={{ marginBottom: 24, border: '1px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Add New Strain</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddForm(false); setFormData(EMPTY_FORM); }}>
              Cancel
            </button>
          </div>

          {/* Row 1: Name + Type + Difficulty */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="input-group">
              <label>Name *</label>
              <input className="input" placeholder="Strain name" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Type</label>
              <select className="select" value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as Strain['type'] })}>
                <option value="indica">Indica</option>
                <option value="sativa">Sativa</option>
                <option value="hybrid">Hybrid</option>
                <option value="ruderalis">Ruderalis</option>
                <option value="hemp">Hemp</option>
              </select>
            </div>
            <div className="input-group">
              <label>Difficulty</label>
              <select className="select" value={formData.difficulty}
                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as Strain['difficulty'] })}>
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* Row 2: THC + CBD + Flowering + Yield */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="input-group">
              <label>THC</label>
              <input className="input" placeholder="e.g. 18-25%" value={formData.thc}
                onChange={(e) => setFormData({ ...formData, thc: e.target.value })} />
            </div>
            <div className="input-group">
              <label>CBD</label>
              <input className="input" placeholder="e.g. &lt;1%" value={formData.cbd}
                onChange={(e) => setFormData({ ...formData, cbd: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Flowering Time</label>
              <input className="input" placeholder="e.g. 8-9 weeks" value={formData.floweringTime}
                onChange={(e) => setFormData({ ...formData, floweringTime: e.target.value })} />
            </div>
            <div className="input-group">
              <label>Yield</label>
              <input className="input" placeholder="e.g. High" value={formData.yield}
                onChange={(e) => setFormData({ ...formData, yield: e.target.value })} />
            </div>
          </div>

          {/* Row 3: Description */}
          <div className="input-group" style={{ marginBottom: 12 }}>
            <label>Description *</label>
            <textarea className="input" rows={3} placeholder="Describe this strain..." value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={{ resize: 'vertical' }} />
          </div>

          {/* Tag entry: Effects, Flavors, Medical Uses, Grow Tips */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}>
            <div className="input-group" style={{ flex: 1, minWidth: 160 }}>
              <label>Add Tag</label>
              <select className="select" value={tagField}
                onChange={(e) => setTagField(e.target.value as typeof tagField)}>
                <option value="effects">Effects</option>
                <option value="flavors">Flavors</option>
                <option value="medicalUses">Medical Uses</option>
                <option value="growTips">Grow Tips</option>
              </select>
            </div>
            <div className="input-group" style={{ flex: 2, minWidth: 200 }}>
              <label>&nbsp;</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" placeholder={`Add ${tagField} tag...`}
                  value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
                <button className="btn btn-ghost" onClick={addTag}>Add</button>
              </div>
            </div>
          </div>

          {/* Display tags */}
          {(['effects', 'flavors', 'medicalUses', 'growTips'] as const).map((field) =>
            formData[field].length > 0 && (
              <div key={field} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'capitalize' }}>
                  {field === 'medicalUses' ? 'Medical Uses' : field === 'growTips' ? 'Grow Tips' : field}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {formData[field].map((tag) => (
                    <span key={tag} className="badge badge-gray" style={{ cursor: 'pointer' }}
                      onClick={() => removeTag(field, tag)}>
                      {tag} ×
                    </span>
                  ))}
                </div>
              </div>
            )
          )}

          {/* Submit */}
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => { setShowAddForm(false); setFormData(EMPTY_FORM); }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleAddStrain}
              disabled={saving || !formData.name.trim() || !formData.description.trim()}>
              {saving ? 'Saving...' : 'Save Strain'}
            </button>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="input-group" style={{ flex: 1, minWidth: 200 }}>
            <label>Search by Name</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                placeholder="e.g. Blue Dream, OG Kush..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button className="btn btn-primary" onClick={handleSearch}>
                Search
              </button>
            </div>
          </div>
          <div className="input-group">
            <label>Type</label>
            <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="indica">Indica</option>
              <option value="sativa">Sativa</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div className="input-group">
            <label>Effect</label>
            <select
              className="select"
              value={effectFilter}
              onChange={(e) => handleEffectFilter(e.target.value)}
            >
              <option value="">All Effects</option>
              {availableEffects.slice(0, 30).map((effect) => (
                <option key={effect} value={effect}>{effect}</option>
              ))}
            </select>
          </div>
          {(searchQuery || typeFilter !== 'all' || effectFilter) && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearchQuery('');
                setTypeFilter('all');
                setEffectFilter('');
                loadStrains();
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 16 }}>
          {error}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 12 }} onClick={loadStrains}>
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card">
          <div className="loading-overlay">
            <div className="spinner spinner-lg" />
            <span>Loading strains...</span>
          </div>
        </div>
      )}

      {/* Strain Grid */}
      {!loading && (
        <>
          <div className="card-grid">
            {displayStrains.map((strain) => (
              <div
                key={strain.id}
                className="strain-card"
                onClick={() => setSelectedStrain(selectedStrain?.id === strain.id ? null : strain)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <h3>{strain.name}</h3>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div className={`strain-type badge ${typeColor(strain.type)}`}>
                        {strain.type}
                      </div>
                      {isCustom(strain.id) && (
                        <span className="badge badge-blue">custom</span>
                      )}
                    </div>
                  </div>
                  {isCustom(strain.id) && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)', fontSize: 12 }}
                      onClick={(e) => { e.stopPropagation(); handleDelete(strain.id); }}
                    >
                      Delete
                    </button>
                  )}
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                  {strain.description.slice(0, 120)}{strain.description.length > 120 ? '...' : ''}
                </p>

                <div className="strain-stats">
                  <div className="strain-stat">
                    <span className="label">THC</span>
                    <span className="value">{strain.thc}</span>
                  </div>
                  <div className="strain-stat">
                    <span className="label">CBD</span>
                    <span className="value">{strain.cbd}</span>
                  </div>
                </div>

                {strain.effects.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {strain.effects.slice(0, 4).map((effect) => (
                      <span key={effect} className="badge badge-gray">{effect}</span>
                    ))}
                  </div>
                )}

                {/* Expanded Details */}
                {selectedStrain?.id === strain.id && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                        Full Description
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {strain.description}
                      </p>
                    </div>

                    {strain.effects.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                          Effects
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {strain.effects.map((e) => (
                            <span key={e} className="badge badge-green">{e}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {strain.flavors.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                          Flavors
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {strain.flavors.map((f) => (
                            <span key={f} className="badge badge-blue">{f}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {strain.medicalUses.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                          Medical Uses
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {strain.medicalUses.map((m) => (
                            <span key={m} className="badge badge-purple">{m}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {displayStrains.length === 0 && !loading && (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>&#128269;</div>
              <h3 style={{ marginBottom: 8 }}>No Strains Found</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {searchQuery ? 'Try a different search term.' : 'Try a different filter.'}
              </p>
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--text-dim)' }}>
            Showing {displayStrains.length} strains
          </div>
        </>
      )}
    </div>
  );
}
