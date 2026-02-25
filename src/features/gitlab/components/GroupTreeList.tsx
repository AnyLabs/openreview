/**
 * 组织/群组树形列表组件
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
import type { PlatformOrg } from "../../../types/platform";

// 本地 Group 类型（用于树形结构，使用 camelCase）
interface Group {
  id: number | string;
  name: string;
  path?: string;
  fullName?: string;
  fullPath?: string;
  description?: string;
  avatarUrl?: string;
  webUrl?: string;
  parentId?: number | string | null;
  children?: Group[];
}

interface OrgTreeListProps {
  orgs: Group[];
  loading: boolean;
  error: string | null;
  onSelect?: () => void;
}

// 将扁平数组转换为树形结构
function buildTree(orgs: Group[]): Group[] {
  const map = new Map<string | number, Group>();
  const roots: Group[] = [];

  // 首先创建所有节点的映射
  orgs.forEach((org) => {
    map.set(org.id, { ...org, children: [] });
  });

  // 然后建立父子关系
  orgs.forEach((org) => {
    const node = map.get(org.id)!;
    if (org.parentId && map.has(org.parentId)) {
      const parent = map.get(org.parentId)!;
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

// 过滤树形结构（保留匹配的节点及其父路径）
function filterTree(orgs: Group[], query: string): Group[] {
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

  return orgs
    .map((org) => filterNode(org))
    .filter((org): org is Group => org !== null);
}

// 获取所有节点ID（用于展开搜索结果的父节点）
function getAllNodeIds(orgs: Group[]): (string | number)[] {
  const ids: (string | number)[] = [];

  function traverse(node: Group) {
    ids.push(node.id);
    node.children?.forEach(traverse);
  }

  orgs.forEach(traverse);
  return ids;
}

// 树节点组件
interface TreeNodeProps {
  node: Group;
  level: number;
  expandedIds: Set<string | number>;
  selectedId?: string | number;
  onToggle: (id: string | number) => void;
  onSelect: (org: PlatformOrg) => void;
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
    // 转换为 PlatformOrg
    const platformOrg: PlatformOrg = {
      id: node.id,
      name: node.name,
      path: node.path || String(node.id),
      fullName: node.fullName || node.name,
      fullPath: node.fullPath || String(node.id),
      description: node.description,
      avatarUrl: node.avatarUrl,
      webUrl: node.webUrl,
      parentId: node.parentId,
    };
    onSelect(platformOrg);
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
 * 组织/群组树形列表组件
 */
export function GroupTreeList({
  orgs,
  loading,
  error,
  onSelect,
}: OrgTreeListProps) {
  const [state, actions] = useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string | number>>(
    new Set()
  );

  // 构建树形结构
  const treeData = useMemo(() => buildTree(orgs), [orgs]);

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
    (org: PlatformOrg) => {
      actions.selectOrg(org);
      onSelect?.();
    },
    [actions, onSelect]
  );

  // 未连接时显示提示
  if (!state.isConnected) {
    return (
      <div className="sidebar-section-body">
        <div className="list-item-hint">请先配置 Git 平台连接</div>
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
          placeholder="搜索组织..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="panel-search-input"
        />
      </div>

      {/* 树形列表 */}
      <div className="tree-list">
        {filteredTreeData.length === 0 ? (
          <div className="list-item-hint">
            {searchQuery.trim() ? "无匹配组织" : "暂无组织"}
          </div>
        ) : (
          filteredTreeData.map((org) => (
            <TreeNode
              key={org.id}
              node={org}
              level={0}
              expandedIds={effectiveExpandedIds}
              selectedId={state.selectedOrg?.id}
              onToggle={handleToggle}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
