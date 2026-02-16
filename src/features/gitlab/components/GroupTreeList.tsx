/**
 * 群组树形列表组件
 * 支持层级展示、展开/折叠、每一级都可选中
 */

import { useState, useMemo, useCallback } from "react";
import {
  Loader2,
  Search,
  ChevronRight,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useApp } from "../../../contexts/AppContext";
import { GitLabGroup } from "../../../types/gitlab";

// 群组数据接口
interface Group {
  id: number | string;
  name: string;
  full_name?: string;
  full_path?: string;
  parent_id?: number | string | null;
  children?: Group[];
}

interface GroupTreeListProps {
  groups: Group[];
  loading: boolean;
  error: string | null;
  onSelect?: () => void;
}

// 将扁平数组转换为树形结构
function buildTree(groups: Group[]): Group[] {
  const map = new Map<string | number, Group>();
  const roots: Group[] = [];

  // 首先创建所有节点的映射
  groups.forEach((group) => {
    map.set(group.id, { ...group, children: [] });
  });

  // 然后建立父子关系
  groups.forEach((group) => {
    const node = map.get(group.id)!;
    if (group.parent_id && map.has(group.parent_id)) {
      const parent = map.get(group.parent_id)!;
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

// 过滤树形结构（保留匹配的节点及其父路径）
function filterTree(groups: Group[], query: string): Group[] {
  const lowerQuery = query.toLowerCase();

  function filterNode(node: Group): Group | null {
    const matches = node.name.toLowerCase().includes(lowerQuery);
    const filteredChildren = node.children
      ?.map((child) => filterNode(child))
      .filter((child): child is Group => child !== null);

    if (matches || (filteredChildren && filteredChildren.length > 0)) {
      return {
        ...node,
        children: filteredChildren,
      };
    }
    return null;
  }

  return groups
    .map((group) => filterNode(group))
    .filter((group): group is Group => group !== null);
}

// 获取所有节点ID（用于展开搜索结果的父节点）
function getAllNodeIds(groups: Group[]): (string | number)[] {
  const ids: (string | number)[] = [];

  function traverse(node: Group) {
    ids.push(node.id);
    node.children?.forEach(traverse);
  }

  groups.forEach(traverse);
  return ids;
}

// 树节点组件
interface TreeNodeProps {
  node: Group;
  level: number;
  expandedIds: Set<string | number>;
  selectedId?: string | number;
  onToggle: (id: string | number) => void;
  onSelect: (group: Group) => void;
}

function TreeNode({
  node,
  level,
  expandedIds,
  selectedId,
  onToggle,
  onSelect,
}: TreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggle(node.id);
    }
  };

  const handleSelect = () => {
    onSelect(node);
  };

  return (
    <div className="tree-node">
      <div
        className={`tree-node-content ${isSelected ? "active" : ""}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleSelect}
      >
        {/* 展开/折叠按钮 */}
        <button
          className={`tree-node-toggle ${hasChildren ? "has-children" : ""} ${
            isExpanded ? "expanded" : ""
          }`}
          onClick={handleToggle}
          disabled={!hasChildren}
          aria-label={isExpanded ? "折叠" : "展开"}
        >
          {hasChildren && <ChevronRight size={14} />}
        </button>

        {/* 文件夹图标 */}
        <span className="tree-node-icon">
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen size={16} />
            ) : (
              <Folder size={16} />
            )
          ) : (
            <Folder size={16} />
          )}
        </span>

        {/* 节点名称 */}
        <span className="tree-node-text">{node.name}</span>
      </div>

      {/* 子节点 */}
      {hasChildren && isExpanded && (
        <div className="tree-node-children">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 群组树形列表组件
 */
export function GroupTreeList({
  groups,
  loading,
  error,
  onSelect,
}: GroupTreeListProps) {
  const [state, actions] = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(
    new Set()
  );

  // 构建树形结构
  const treeData = useMemo(() => buildTree(groups), [groups]);

  // 过滤后的树形数据
  const filteredTreeData = useMemo(() => {
    if (!searchQuery.trim()) return treeData;
    return filterTree(treeData, searchQuery);
  }, [treeData, searchQuery]);

  // 搜索时自动展开所有匹配结果的父节点
  const effectiveExpandedIds = useMemo(() => {
    if (!searchQuery.trim()) return expandedIds;
    // 搜索时展开所有节点
    return new Set(getAllNodeIds(filteredTreeData));
  }, [searchQuery, filteredTreeData, expandedIds]);

  // 切换展开/折叠状态
  const handleToggle = useCallback((id: string | number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 选择节点
  const handleSelect = useCallback(
    (group: Group) => {
      // 找到原始数据中的完整群组信息
      const originalGroup = groups.find((g) => g.id === group.id);
      if (originalGroup) {
        // 将 Group 转换为 GitLabGroup
        const gitlabGroup: GitLabGroup = {
          id: originalGroup.id,
          name: originalGroup.name,
          path: originalGroup.full_path || String(originalGroup.id),
          full_name: originalGroup.name,
          full_path: originalGroup.full_path || String(originalGroup.id),
          description: "",
          avatar_url: null,
          web_url: "",
          parent_id: null,
        };
        actions.selectGroup(gitlabGroup);
        onSelect?.();
      }
    },
    [actions, groups, onSelect]
  );

  // 未连接时显示提示
  if (!state.isConnected) {
    return (
      <div className="sidebar-section-body">
        <div className="list-item-hint">请先配置 GitLab 连接</div>
      </div>
    );
  }

  // 加载中
  if (loading) {
    return (
      <div className="sidebar-section-body">
        <div className="list-item-loading">
          <Loader2
            size={14}
            className="spin"
          />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  // 错误
  if (error) {
    return (
      <div className="sidebar-section-body">
        <div className="list-item-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="sidebar-section-body">
      {/* 搜索输入框 */}
      <div className="panel-search-box">
        <Search
          size={12}
          className="panel-search-icon"
        />
        <input
          type="text"
          placeholder="搜索群组..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="panel-search-input"
        />
      </div>

      {/* 树形列表 */}
      <div className="tree-list">
        {filteredTreeData.length === 0 ? (
          <div className="list-item-hint">
            {searchQuery.trim() ? "无匹配群组" : "暂无群组"}
          </div>
        ) : (
          filteredTreeData.map((group) => (
            <TreeNode
              key={group.id}
              node={group}
              level={0}
              expandedIds={effectiveExpandedIds}
              selectedId={state.selectedGroup?.id}
              onToggle={handleToggle}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

export type { Group };
