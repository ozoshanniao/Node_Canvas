export const fetchLLMSkills = async (projectPath) => {
  const query = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : '';
  const response = await fetch(`http://127.0.0.1:8000/api/llm/skills${query}`);
  const skills = await response.json();
  if (!response.ok) {
    throw new Error(skills?.detail || `Failed to load local skills: ${response.status}`);
  }
  return Array.isArray(skills) ? skills : [];
};

export const normalizeEnabledSkills = (enabledSkills = [], availableSkills = []) => {
  const availableIds = new Set(availableSkills.map((skill) => skill.id));
  return enabledSkills.filter((skillId) => availableIds.has(skillId));
};

export const getSkillDisplayName = (skill = {}) => skill.name || skill.id || 'Unnamed Skill';

export const getEnabledSkillsForPayload = (enabledSkills = [], supportsLocalSoftSkills = false) => {
  return supportsLocalSoftSkills ? enabledSkills : [];
};

export const shouldRenderLocalSkillsPanel = (supportsLocalSoftSkills = false) => {
  return Boolean(supportsLocalSoftSkills);
};
