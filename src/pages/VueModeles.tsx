import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

// Define base URL for API requests
const BASE_URL = '/api'; // Relative path for Apache proxy

// Define types
interface FileData {
  id: number;
  filename: string;
  path: string;
  date: string;
}

interface Field {
  label: string;
  type: 'text' | 'select' | 'textarea' | 'table' | 'radio';
  options?: string[];
}

interface Section {
  title: string;
  fields: Field[];
  isOpen: boolean;
}

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={`bg-white shadow-sm rounded-2xl border border-gray-100 ${className}`}>
    {children}
  </div>
);

const CardHeader: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={`p-2 border-b border-gray-100 bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-t-2xl ${className}`}>
    {children}
  </div>
);

const CardTitle: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <h2 className={`text-sm font-semibold text-white flex items-center gap-2 ${className}`}>
    {children}
  </h2>
);

const CardContent: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={`p-4 ${className}`}>{children}</div>
);

const VueModeles: React.FC = () => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterBrick, setFilterBrick] = useState<string>('');
  const [showAll, setShowAll] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingFile, setEditingFile] = useState<FileData | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [newField, setNewField] = useState({ section: '', label: '', type: 'text', options: '' });
  const modalRef = useRef<HTMLDivElement>(null);

  // Target sections for parsing HTML
  const targetSections = [
    'Classification',
    "Données d'identification",
    'Données spécifiques du produit',
    'Conditionnement & Logistique',
    'Données tarifaires'
  ];

  // Fetch HTML files from /api/files endpoint
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const res = await axios.get(`${BASE_URL}/files`);
        if (!res.data || !Array.isArray(res.data)) {
          throw new Error('Réponse invalide du serveur: la liste des fichiers doit être un tableau');
        }
        const processedFiles: FileData[] = res.data.map(file => ({
          id: file.id,
          filename: file.filename,
          path: `/modeles/${file.filename}`,
          date: file.date
        }));
        setFiles(processedFiles);
        setFilteredFiles(processedFiles);
        setError(null);
      } catch (err: any) {
        setError('Échec du chargement des fichiers depuis /modeles : ' + (err.message || 'Erreur inconnue'));
        console.error('Fetch files error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFiles();
  }, []);

  // Filter files based on brick
  useEffect(() => {
    if (showAll) {
      setFilteredFiles(files);
    } else {
      setFilteredFiles(
        files.filter(file => !filterBrick || file.filename.includes(filterBrick))
      );
    }
  }, [filterBrick, showAll, files]);

  // Handle file open in new tab
  const handleOpen = (file: FileData) => {
    window.open(file.path, '_blank');
  };

  // Parse HTML and extract sections and fields
  const parseHtmlContent = (content: string): Section[] => {
    if (!content.trim()) {
      console.error('Contenu HTML vide');
      return [];
    }

    const parser = new DOMParser();
    const cleanedContent = content.replace(/^<DOCUMENT[^>]*>|<\/DOCUMENT>$/g, '').trim();
    const doc = parser.parseFromString(`<html><body>${cleanedContent}</body></html>`, 'text/html');
    const sections: Section[] = [];

    const allElements = Array.from(doc.body.getElementsByTagName('*'));
    let currentSection: Section | null = null;

    allElements.forEach(element => {
      const textContent = element.textContent?.trim().replace(/[▶🧩🔍📋📦💰]+/, '') || '';
      const sectionTitle = targetSections.find(title => textContent.includes(title));
      if (sectionTitle) {
        if (currentSection && currentSection.fields.length > 0) {
          sections.push(currentSection);
        }
        currentSection = {
          title: sectionTitle,
          fields: [],
          isOpen: false
        };
      } else if (currentSection) {
        const inputs = element.querySelectorAll('input, select, textarea, table');
        inputs.forEach(input => {
          const parentDiv = input.closest('div');
          if (!parentDiv) return;

          let labelElement = parentDiv.previousElementSibling;
          while (labelElement && labelElement.tagName === 'DIV' && !labelElement.textContent?.trim()) {
            labelElement = labelElement.previousElementSibling;
          }
          let label = labelElement?.textContent?.trim().replace(':', '') ||
                      parentDiv.querySelector('div:not(:has(input, select, textarea, table))')?.textContent?.trim().replace(':', '') ||
                      parentDiv.textContent?.trim().replace(':', '').split('\n')[0] ||
                      'Champ sans titre';
          label = label.replace(/[▶🧩🔍📋📦💰]+/, '').trim();

          let type: Field['type'] = 'text';
          let options: string[] | undefined;

          const tagName = input.tagName.toLowerCase();
          if (tagName === 'table') {
            type = 'table';
          } else if (tagName === 'input') {
            const inputType = input.getAttribute('type')?.toLowerCase();
            if (inputType === 'radio') {
              type = 'radio';
              options = Array.from(parentDiv.querySelectorAll('input[type="radio"]'))
                .map(radio => radio.nextSibling?.textContent?.trim() || '')
                .filter(opt => opt);
            } else {
              type = 'text';
            }
          } else if (tagName === 'select') {
            type = 'select';
            options = Array.from(input.querySelectorAll('option'))
              .map(opt => opt.textContent?.trim() || '')
              .filter(opt => opt);
          } else if (tagName === 'textarea') {
            type = 'textarea';
          }

          if (label && !currentSection.fields.some(f => f.label === label)) {
            currentSection.fields.push({ label, type, options });
          }
        });
      }
    });

    if (currentSection && currentSection.fields.length > 0) {
      sections.push(currentSection);
    }

    return sections;
  };

  // Handle file edit
  const handleEdit = async (file: FileData) => {
    try {
      setError(null);
      const res = await axios.get(`${BASE_URL}/file-content/${file.id}`);
      const content = res.data.content;
      if (!content.trim()) throw new Error('Le contenu du fichier est vide');
      const parsedSections = parseHtmlContent(content);
      setEditingFile(file);
      setSections(parsedSections);
      setIsModalOpen(true);
      if (parsedSections.length === 0) {
        setError('Aucune section cible trouvée dans le HTML. Assurez-vous que le fichier contient les sections : ' + targetSections.join(', '));
      }
    } catch (err: any) {
      setError('Échec du chargement du contenu du fichier : ' + (err.message || 'Erreur inconnue'));
      setIsModalOpen(true);
      console.error('Edit file error:', err);
    }
  };

  // Update field metadata
  const updateField = (sectionIndex: number, fieldIndex: number, updatedField: Field) => {
    setSections(prev => {
      const newSections = [...prev];
      newSections[sectionIndex].fields[fieldIndex] = updatedField;
      return newSections;
    });
  };

  // Delete field
  const deleteField = (sectionIndex: number, fieldIndex: number) => {
    setSections(prev => {
      const newSections = [...prev];
      newSections[sectionIndex].fields.splice(fieldIndex, 1);
      return newSections;
    });
  };

  // Add new field
  const addField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newField.section || !newField.label) return;

    const sectionIndex = sections.findIndex(s => s.title === newField.section);
    if (sectionIndex === -1) return;

    const field: Field = {
      label: newField.label,
      type: newField.type as Field['type'],
      options: (newField.type === 'select' || newField.type === 'radio') ? newField.options.split(',').map(opt => opt.trim()) : undefined
    };

    setSections(prev => {
      const newSections = [...prev];
      newSections[sectionIndex].fields.push(field);
      return newSections;
    });

    setNewField({ section: '', label: '', type: 'text', options: '' });
  };

  // Rebuild HTML from sections
  const rebuildHtml = (originalContent: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(originalContent, 'text/html');
    const sectionElements = Array.from(doc.body.getElementsByTagName('*')).filter(el => {
      const text = el.textContent?.trim().replace(/[▶🧩🔍📋📦💰]+/, '') || '';
      return targetSections.some(title => text.includes(title));
    });

    sections.forEach((section, index) => {
      const header = sectionElements[index];
      if (!header) return;

      header.textContent = section.title;

      let fieldContainer = header.nextElementSibling as HTMLElement;
      if (!fieldContainer || fieldContainer.tagName !== 'DIV') {
        fieldContainer = doc.createElement('div');
        header.insertAdjacentElement('afterend', fieldContainer);
      }
      fieldContainer.innerHTML = '';

      section.fields.forEach(field => {
        const fieldDiv = doc.createElement('div');
        fieldDiv.className = 'mb-4';
        const innerDiv = doc.createElement('div');
        const labelDiv = doc.createElement('div');
        labelDiv.textContent = field.label + ':';
        labelDiv.className = 'text-sm font-medium text-gray-700';
        innerDiv.appendChild(labelDiv);
        fieldDiv.appendChild(innerDiv);

        if (field.type === 'text') {
          const input = doc.createElement('input');
          input.type = 'text';
          input.className = 'w-full border p-2 rounded mt-1';
          innerDiv.appendChild(input);
        } else if (field.type === 'select') {
          const select = doc.createElement('select');
          select.className = 'w-full border p-2 rounded mt-1';
          field.options?.forEach(opt => {
            const option = doc.createElement('option');
            option.textContent = opt;
            select.appendChild(option);
          });
          innerDiv.appendChild(select);
        } else if (field.type === 'radio') {
          const radioContainer = doc.createElement('div');
          radioContainer.className = 'flex gap-4 mt-1';
          field.options?.forEach(opt => {
            const radioDiv = doc.createElement('div');
            const radio = doc.createElement('input');
            radio.type = 'radio';
            radio.name = field.label.replace(/\s+/g, '_');
            radio.value = opt;
            const radioLabel = doc.createElement('span');
            radioLabel.textContent = opt;
            radioLabel.className = 'ml-1';
            radioDiv.appendChild(radio);
            radioDiv.appendChild(radioLabel);
            radioContainer.appendChild(radioDiv);
          });
          innerDiv.appendChild(radioContainer);
        } else if (field.type === 'textarea' || field.type === 'table') {
          const textarea = doc.createElement('textarea');
          textarea.className = 'w-full border p-2 rounded mt-1';
          textarea.rows = field.type === 'table' ? 6 : 4;
          innerDiv.appendChild(textarea);
        }

        fieldContainer.appendChild(fieldDiv);
      });
    });

    const filename = editingFile?.filename || 'inconnu.html';
    let htmlString = doc.body.innerHTML;
    return `<!DOCTYPE html>\n<DOCUMENT filename="${filename}">\n${htmlString}\n</DOCUMENT>`;
  };

  // Handle file save
  const handleSave = async () => {
    if (!editingFile) return;
    try {
      const originalContent = (await axios.get(`${BASE_URL}/file-content/${editingFile.id}`)).data.content;
      const updatedContent = rebuildHtml(originalContent);
      await axios.post(
        `${BASE_URL}/save-file`,
        {
          path: `/modeles/${editingFile.filename}`,
          content: updatedContent
        }
      );
      alert('Fichier enregistré avec succès.');
      setIsModalOpen(false);
      setEditingFile(null);
      setSections([]);
      const res = await axios.get(`${BASE_URL}/files`);
      const processedFiles: FileData[] = res.data.map((file: any) => ({
        id: file.id,
        filename: file.filename,
        path: `/modeles/${file.filename}`,
        date: file.date
      }));
      setFiles(processedFiles);
      setFilteredFiles(processedFiles);
    } catch (err: any) {
      setError('Échec de l\'enregistrement du fichier : ' + (err.message || 'Erreur inconnue'));
      console.error('Save file error:', err);
    }
  };

  // Handle file delete
  const handleDelete = async (file: FileData) => {
    if (window.confirm(`Voulez-vous vraiment supprimer ${file.filename} ?`)) {
      try {
        await axios.delete(`${BASE_URL}/files/${file.id}`);
        setFiles(prev => prev.filter(f => f.id !== file.id));
        setFilteredFiles(prev => prev.filter(f => f.id !== file.id));
        alert(`Fichier ${file.filename} supprimé.`);
      } catch (err: any) {
        setError('Échec de la suppression du fichier : ' + (err.message || 'Erreur inconnue'));
        console.error('Delete file error:', err);
      }
    }
  };

  // Close modal on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        setIsModalOpen(false);
        setEditingFile(null);
        setSections([]);
        setError(null);
      }
    };

    if (isModalOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isModalOpen]);

  // Explicit return blocks to avoid parser issues
  if (loading) {
    return (
      <div className="text-center p-8 text-gray-600 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-900"></div>
        <span className="ml-4 text-sm">Chargement des fichiers...</span>
      </div>
    );
  }
  if (error && !files.length) {
    return (
      <div className="text-red-500 text-center p-8 bg-red-50 min-h-screen flex items-center justify-center">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-200">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-gray-50 to-gray-200 min-h-screen pt-2 px-6 font-sans flex flex-col gap-6">
      {/* Breadcrumb */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: 90,
          backgroundColor: 'white',
          padding: '10px 20px',
          borderRadius: '8px',
          zIndex: 10,
          fontFamily: 'Arial, sans-serif',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#3b82f6',
        }}
      >
        <span style={{ color: '#2563eb' }}>Produits</span>
        /
        <span style={{ color: '#3b82f6' }}>Générateur Modèles</span>
        /
        <span style={{ color: '#1d4ed8' }}>Vue Modèle</span>
      </div>

      {/* File List Section */}
      <div className="w-full max-w-8xl mx-auto py-2">
        <Card>
          <CardHeader className="py-0">
            <CardTitle>
              <span className="text-xl">📂</span> Modèles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={() => setShowAll(!showAll)}
                  className="h-4 w-4 text-blue-900 border-gray-300 rounded focus:ring-blue-900"
                />
                <label className="ml-2 text-sm font-semibold text-gray-700">Afficher tous</label>
              </div>
              {!showAll && (
                <div className="flex-1 w-full sm:w-auto">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Filtrer par Brick</label>
                  <input
                    type="text"
                    value={filterBrick}
                    onChange={(e) => setFilterBrick(e.target.value)}
                    className="w-full border border-gray-200 p-2 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-900 focus:border-blue-900 text-sm"
                    placeholder="Entrer le brick"
                  />
                </div>
              )}
            </div>
            <div className="max-h-[450px] overflow-y-auto">
              {filteredFiles.length === 0 ? (
                <p className="text-gray-500 text-center py-6 text-sm">Aucune fiche produit trouvée.</p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="p-2 text-left text-xs font-semibold text-gray-700">Nom du fichier</th>
                      <th className="p-2 text-left text-xs font-semibold text-gray-700">Date</th>
                      <th className="p-2 text-left text-xs font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFiles.map(file => (
                      <tr key={file.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 text-sm text-gray-700">
                          {file.filename}
                        </td>
                        <td className="p-2 text-sm text-gray-700">
                          {new Date(file.date).toLocaleDateString()}
                        </td>
                        <td className="p-2 text-sm">
                          <button
                            onClick={() => handleOpen(file)}
                            className="text-blue-900 hover:underline mr-2"
                            title="Ouvrir dans un nouvel onglet"
                          >
                            Ouvrir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div ref={modalRef} className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Modifier {editingFile?.filename}</h2>
            {error && (
              <div className="text-red-500 mb-3 p-3 bg-red-50 rounded-2xl">{error}</div>
            )}
            {sections.map((section, sectionIndex) => (
              <div key={section.title} className="mb-4">
                <h3
                  className="text-sm font-semibold text-gray-700 cursor-pointer flex items-center"
                  onClick={() => {
                    setSections(prev => {
                      const newSections = [...prev];
                      newSections[sectionIndex].isOpen = !newSections[sectionIndex].isOpen;
                      return newSections;
                    });
                  }}
                >
                  {section.title} {section.isOpen ? '▼' : '▶'}
                </h3>
                {section.isOpen && (
                  <div className="pl-4">
                    {section.fields.map((field, fieldIndex) => (
                      <div key={field.label} className="mb-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateField(sectionIndex, fieldIndex, { ...field, label: e.target.value })}
                          className="border p-2 rounded flex-1 text-sm"
                          placeholder="Label du champ"
                        />
                        <select
                          value={field.type}
                          onChange={(e) => updateField(sectionIndex, fieldIndex, { ...field, type: e.target.value as Field['type'] })}
                          className="border p-2 rounded text-sm"
                        >
                          <option value="text">Texte</option>
                          <option value="select">Liste déroulante</option>
                          <option value="radio">Radio</option>
                          <option value="textarea">Zone de texte</option>
                          <option value="table">Tableau</option>
                        </select>
                        {(field.type === 'select' || field.type === 'radio') && (
                          <input
                            type="text"
                            value={field.options?.join(',') || ''}
                            onChange={(e) => updateField(sectionIndex, fieldIndex, { ...field, options: e.target.value.split(',').map(opt => opt.trim()) })}
                            className="border p-2 rounded flex-1 text-sm"
                            placeholder="Options (séparées par des virgules)"
                          />
                        )}
                        <button
                          onClick={() => deleteField(sectionIndex, fieldIndex)}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Supprimer
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Ajouter un champ</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={newField.section}
                  onChange={(e) => setNewField(prev => ({ ...prev, section: e.target.value }))}
                  className="border p-2 rounded text-sm"
                >
                  <option value="">Sélectionner une section</option>
                  {sections.map(section => (
                    <option key={section.title} value={section.title}>{section.title}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newField.label}
                  onChange={(e) => setNewField(prev => ({ ...prev, label: e.target.value }))}
                  className="border p-2 rounded flex-1 text-sm"
                  placeholder="Label du champ"
                />
                <select
                  value={newField.type}
                  onChange={(e) => setNewField(prev => ({ ...prev, type: e.target.value }))}
                  className="border p-2 rounded text-sm"
                >
                  <option value="text">Texte</option>
                  <option value="select">Liste déroulante</option>
                  <option value="radio">Radio</option>
                  <option value="textarea">Zone de texte</option>
                  <option value="table">Tableau</option>
                </select>
                {(newField.type === 'select' || newField.type === 'radio') && (
                  <input
                    type="text"
                    value={newField.options}
                    onChange={(e) => setNewField(prev => ({ ...prev, options: e.target.value }))}
                    className="border p-2 rounded flex-1 text-sm"
                    placeholder="Options (séparées par des virgules)"
                  />
                )}
                <button
                  onClick={addField}
                  className="bg-blue-900 text-white p-2 rounded hover:bg-blue-800 text-sm"
                >
                  Ajouter
                </button>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingFile(null);
                  setSections([]);
                  setError(null);
                }}
                className="bg-gray-300 text-gray-700 p-2 rounded hover:bg-gray-400 text-sm"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                className="bg-blue-900 text-white p-2 rounded hover:bg-blue-800 text-sm"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VueModeles;