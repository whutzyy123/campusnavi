"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/use-auth-store";
import { AuthGuard } from "@/components/auth-guard";
import { AdminLayout } from "@/components/admin-layout";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Building2, Plus, MoreVertical, Edit, Power, PowerOff, Trash2, Save, RotateCcw, X, AlertTriangle, Check, Copy } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { useAMap } from "@/hooks/use-amap";
import { CoordinateConverter } from "@/lib/amap-loader";

interface School {
  id: string;
  name: string;
  schoolCode: string;
  isActive: boolean;
  userCount: number;
  poiCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 超级管理员后台 - 学校管理页面
 * 功能：查看所有学校、新增学校、编辑学校、停用/激活、删除学校
 */
export default function SchoolsManagementPage() {
  const router = useRouter();
  const { currentUser } = useAuthStore();
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoadingSchools, setIsLoadingSchools] = useState(true);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editName, setEditName] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [deletingSchool, setDeletingSchool] = useState<School | null>(null);
  const [deleteConfirmCode, setDeleteConfirmCode] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // 新增学校模态框相关状态
  const [showCreateSchoolModal, setShowCreateSchoolModal] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState("");
  const [newSchoolCode, setNewSchoolCode] = useState("");
  const [boundaryPoints, setBoundaryPoints] = useState<[number, number][]>([]);
  const [isCreatingSchool, setIsCreatingSchool] = useState(false);
  const [createdSchoolId, setCreatedSchoolId] = useState<string | null>(null);
  const [showGenerateInviteAfterCreate, setShowGenerateInviteAfterCreate] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // 地图相关 refs
  const createSchoolMapRef = useRef<HTMLDivElement>(null);
  const createSchoolMapInstanceRef = useRef<any>(null);
  const createSchoolMarkersRef = useRef<any[]>([]);
  const createSchoolPolygonRef = useRef<any>(null);
  const { amap: createSchoolAmap, loading: createSchoolMapLoading } = useAMap();

  // 检查是否为超级管理员
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  // 获取学校列表的函数（可重复调用）
  const fetchSchools = async () => {
    setIsLoadingSchools(true);
    try {
      const response = await fetch("/api/schools");
      const data = await response.json();
      if (data.success) {
        setSchools(data.schools);
      } else {
        toast.error(data.message || "获取学校列表失败");
      }
    } catch (error) {
      console.error("获取学校列表失败:", error);
      toast.error("获取学校列表失败");
    } finally {
      setIsLoadingSchools(false);
    }
  };

  // 加载学校列表
  useEffect(() => {
    fetchSchools();
  }, []);

  // 切换学校状态（停用/激活）
  const handleToggleStatus = async (schoolId: string, isActive: boolean) => {
    const actionText = isActive ? "激活" : "停用";
    const toastId = toast.loading(`正在${actionText}学校...`);

    try {
      const response = await fetch(`/api/schools/${schoolId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `无法${actionText}学校`);
      }

      toast.success(`学校已${actionText}`, { id: toastId });
      setActionMenuOpen(null);

      // 关键步骤：重新获取数据以刷新 UI
      await fetchSchools();
    } catch (error) {
      console.error(`${actionText}学校失败:`, error);
      toast.error((error as Error).message || "操作失败", { id: toastId });
    }
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingSchool || !editName.trim()) {
      toast.error("学校名称不能为空");
      return;
    }

    const toastId = toast.loading("正在更新学校信息...");

    try {
      const response = await fetch(`/api/schools/${editingSchool.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: editName.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "更新失败");
      }

      toast.success("学校信息更新成功", { id: toastId });
      setShowEditModal(false);
      setEditingSchool(null);
      setEditName("");

      // 刷新学校列表
      await fetchSchools();
    } catch (error) {
      console.error("更新学校信息失败:", error);
      toast.error((error as Error).message || "更新失败", { id: toastId });
    }
  };

  // 创建自定义圆形 Marker 的 HTML 内容（用于新增学校模态框）
  const createMarkerContent = (index: number): string => {
    return `
      <div style="
        position: relative;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s ease;
        z-index: 10;
      " 
      onmouseover="this.style.transform='scale(1.3)'" 
      onmouseout="this.style.transform='scale(1)'">
        <div style="
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background-color: #1890ff;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <span style="
            font-size: 7px;
            font-weight: 600;
            color: #ffffff;
            line-height: 1;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            user-select: none;
          ">${index}</span>
        </div>
      </div>
    `;
  };

  // 初始化新增学校模态框中的地图
  useEffect(() => {
    if (!showCreateSchoolModal || !createSchoolAmap || !createSchoolMapRef.current || createSchoolMapInstanceRef.current) {
      return;
    }

    // 创建地图实例
    const map = new createSchoolAmap.Map(createSchoolMapRef.current, {
      zoom: 15,
      center: [116.397428, 39.90923], // 默认中心：北京
      viewMode: "3D",
      mapStyle: "amap://styles/normal",
    });

    createSchoolMapInstanceRef.current = map;

    // 地图点击事件：添加标记点
    const handleMapClick = (e: any) => {
      const { lng, lat } = e.lnglat;
      const coord: [number, number] = [lng, lat];

      try {
        CoordinateConverter.formatCoordinate(coord[0], coord[1]);

        setBoundaryPoints((prevPoints) => {
          const newIndex = prevPoints.length + 1;
          const markerContent = createMarkerContent(newIndex);
          
          const marker = new createSchoolAmap.Marker({
            position: coord,
            content: markerContent,
            anchor: "center",
            offset: new createSchoolAmap.Pixel(0, 0),
          });
          
          marker.setMap(map);
          createSchoolMarkersRef.current.push(marker);

          return [...prevPoints, coord];
        });
      } catch (err) {
        console.error("Invalid coordinate:", err);
      }
    };

    map.on("click", handleMapClick);

    return () => {
      if (createSchoolMapInstanceRef.current) {
        createSchoolMapInstanceRef.current.off("click", handleMapClick);
        createSchoolMapInstanceRef.current.destroy();
        createSchoolMapInstanceRef.current = null;
      }
    };
  }, [showCreateSchoolModal, createSchoolAmap]);

  // 监听 boundaryPoints 变化，同步更新多边形
  useEffect(() => {
    if (!createSchoolAmap || !createSchoolMapInstanceRef.current || !showCreateSchoolModal) {
      return;
    }

    if (boundaryPoints.length < 3) {
      if (createSchoolPolygonRef.current) {
        createSchoolMapInstanceRef.current.remove(createSchoolPolygonRef.current);
        createSchoolPolygonRef.current = null;
      }
      return;
    }

    if (createSchoolPolygonRef.current) {
      const closedPath = [...boundaryPoints, boundaryPoints[0]];
      createSchoolPolygonRef.current.setPath(closedPath);
    } else {
      const closedPath = [...boundaryPoints, boundaryPoints[0]];
      createSchoolPolygonRef.current = new createSchoolAmap.Polygon({
        path: closedPath,
        strokeColor: "#1890ff",
        strokeWeight: 3,
        strokeOpacity: 0.8,
        fillColor: "#1890ff",
        fillOpacity: 0.2,
      });
      createSchoolPolygonRef.current.setMap(createSchoolMapInstanceRef.current);
    }
  }, [createSchoolAmap, boundaryPoints, showCreateSchoolModal]);

  // 清除边界
  const clearCreateSchoolBoundary = () => {
    if (!createSchoolMapInstanceRef.current) return;

    createSchoolMarkersRef.current.forEach((marker) => {
      createSchoolMapInstanceRef.current.remove(marker);
    });
    createSchoolMarkersRef.current = [];

    if (createSchoolPolygonRef.current) {
      createSchoolMapInstanceRef.current.remove(createSchoolPolygonRef.current);
      createSchoolPolygonRef.current = null;
    }

    setBoundaryPoints([]);
  };

  // 创建学校
  const handleCreateSchool = async () => {
    if (!newSchoolName.trim() || !newSchoolCode.trim()) {
      toast.error("请填写学校名称和代码");
      return;
    }

    if (boundaryPoints.length < 3) {
      toast.error("至少需要3个点才能构成多边形边界");
      return;
    }

    setIsCreatingSchool(true);

    try {
      const response = await fetch("/api/admin/school", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newSchoolName.trim(),
          schoolCode: newSchoolCode.trim(),
          boundary: boundaryPoints,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "创建失败");
      }

      toast.success("学校创建成功！");
      setCreatedSchoolId(data.data.id);
      setShowGenerateInviteAfterCreate(true);
      
      // 刷新学校列表
      await fetchSchools();
    } catch (error) {
      console.error("创建学校失败:", error);
      toast.error((error as Error).message || "创建失败");
    } finally {
      setIsCreatingSchool(false);
    }
  };

  // 在创建学校后生成邀请码
  const handleGenerateInviteAfterCreate = async () => {
    if (!createdSchoolId || !currentUser) {
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("/api/invitation-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schoolId: createdSchoolId,
          role: 2, // 校级管理员
          issuerId: currentUser.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "生成失败");
      }

      setGeneratedCode(data.invitationCode.code);
      toast.success("邀请码生成成功！");
    } catch (error) {
      console.error("生成邀请码失败:", error);
      toast.error((error as Error).message || "生成失败");
    } finally {
      setIsGenerating(false);
    }
  };

  // 复制邀请码
  const handleCopyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      toast.success("邀请码已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 关闭新增学校模态框
  const handleCloseCreateSchoolModal = () => {
    setShowCreateSchoolModal(false);
    setNewSchoolName("");
    setNewSchoolCode("");
    setBoundaryPoints([]);
    setCreatedSchoolId(null);
    setShowGenerateInviteAfterCreate(false);
    setGeneratedCode("");
    clearCreateSchoolBoundary();
    
    // 清理地图
    if (createSchoolMapInstanceRef.current) {
      createSchoolMapInstanceRef.current.destroy();
      createSchoolMapInstanceRef.current = null;
    }
    createSchoolMarkersRef.current = [];
    createSchoolPolygonRef.current = null;
  };

  // 删除学校
  const handleDeleteSchool = async () => {
    if (!deletingSchool) return;

    if (deleteConfirmCode !== deletingSchool.schoolCode) {
      toast.error("确认代码不匹配，请输入正确的学校代码");
      return;
    }

    const toastId = toast.loading("正在删除学校...");
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/schools/${deletingSchool.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "删除失败");
      }

      toast.success("学校已永久删除", { id: toastId });
      setShowDeleteDialog(false);
      setDeletingSchool(null);
      setDeleteConfirmCode("");

      // 刷新学校列表
      await fetchSchools();
    } catch (error) {
      console.error("删除学校失败:", error);
      toast.error((error as Error).message || "删除失败", { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <AuthGuard requiredRole="SUPER_ADMIN">
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-gray-600">加载中...</p>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard requiredRole="SUPER_ADMIN">
      <AdminLayout>
        <div className="p-6">
          <Card
            title="所有注册学校"
            action={
              <button
                onClick={() => {
                  setShowCreateSchoolModal(true);
                  setNewSchoolName("");
                  setNewSchoolCode("");
                  setBoundaryPoints([]);
                  setCreatedSchoolId(null);
                  setShowGenerateInviteAfterCreate(false);
                }}
                className="flex items-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90"
              >
                <Plus className="h-4 w-4" />
                新增学校
              </button>
            }
          >
            {isLoadingSchools ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
              </div>
            ) : schools.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="暂无学校数据"
                description="系统中还没有注册的学校，请先创建学校"
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">学校名称</TableHead>
                      <TableHead className="w-[120px]">唯一代码</TableHead>
                      <TableHead className="w-[100px]">状态</TableHead>
                      <TableHead className="w-[100px] text-center">用户数</TableHead>
                      <TableHead className="w-[100px] text-center">POI 数</TableHead>
                      <TableHead className="w-[120px]">创建日期</TableHead>
                      <TableHead className="w-[100px] text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schools.map((school) => (
                      <TableRow key={school.id}>
                        <TableCell className="font-medium">{school.name}</TableCell>
                        <TableCell>
                          <code className="rounded bg-gray-100 px-2 py-1 text-xs font-mono text-gray-800">
                            {school.schoolCode}
                          </code>
                        </TableCell>
                        <TableCell>
                          {school.isActive ? (
                            <Badge variant="success">已激活</Badge>
                          ) : (
                            <Badge variant="error">已停用</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{school.userCount}</TableCell>
                        <TableCell className="text-center">{school.poiCount}</TableCell>
                        <TableCell>
                          {new Date(school.createdAt).toLocaleDateString("zh-CN", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="relative">
                            <button
                              onClick={() =>
                                setActionMenuOpen(actionMenuOpen === school.id ? null : school.id)
                              }
                              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {actionMenuOpen === school.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setActionMenuOpen(null)}
                                />
                                <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-lg border border-gray-200 bg-white shadow-lg">
                                  <div className="p-1">
                                    <button
                                      onClick={() => {
                                        setEditingSchool(school);
                                        setEditName(school.name);
                                        setShowEditModal(true);
                                        setActionMenuOpen(null);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                                    >
                                      <Edit className="h-4 w-4" />
                                      编辑
                                    </button>
                                    {school.isActive ? (
                                      <button
                                        onClick={() => handleToggleStatus(school.id, false)}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                                      >
                                        <PowerOff className="h-4 w-4" />
                                        停用
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleToggleStatus(school.id, true)}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-green-600 transition-colors hover:bg-green-50"
                                      >
                                        <Power className="h-4 w-4" />
                                        激活
                                      </button>
                                    )}
                                    <div className="my-1 h-px bg-gray-200"></div>
                                    <button
                                      onClick={() => {
                                        setDeletingSchool(school);
                                        setDeleteConfirmCode("");
                                        setShowDeleteDialog(true);
                                        setActionMenuOpen(null);
                                      }}
                                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      删除学校
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {/* 编辑学校弹窗 */}
          {showEditModal && editingSchool && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">编辑学校信息</h3>
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingSchool(null);
                      setEditName("");
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      学校名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="请输入学校名称"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                    <div className="font-medium">唯一代码：</div>
                    <code className="mt-1 block font-mono text-gray-800">{editingSchool.schoolCode}</code>
                    <div className="mt-1 text-xs text-gray-500">唯一代码创建后不可修改</div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowEditModal(false);
                        setEditingSchool(null);
                        setEditName("");
                      }}
                      className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 删除学校确认弹窗 */}
          {showDeleteDialog && deletingSchool && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">危险操作确认</h3>
                    <p className="text-sm text-gray-500">此操作不可逆</p>
                  </div>
                </div>

                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-medium text-red-800">
                    警告：此操作将永久删除以下内容：
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                    <li>学校：<strong>{deletingSchool.name}</strong></li>
                    <li>所有关联的用户账户</li>
                    <li>所有 POI 点位</li>
                    <li>所有邀请码记录</li>
                  </ul>
                </div>

                <div className="mb-4">
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    请输入学校代码以确认删除：
                    <code className="ml-2 rounded bg-gray-100 px-2 py-1 font-mono text-sm text-gray-800">
                      {deletingSchool.schoolCode}
                    </code>
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmCode}
                    onChange={(e) => setDeleteConfirmCode(e.target.value)}
                    placeholder="输入学校代码"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
                    autoFocus
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowDeleteDialog(false);
                      setDeletingSchool(null);
                      setDeleteConfirmCode("");
                    }}
                    disabled={isDeleting}
                    className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleDeleteSchool}
                    disabled={isDeleting || deleteConfirmCode !== deletingSchool.schoolCode}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        删除中...
                      </span>
                    ) : (
                      "确认删除"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 新增学校模态框 */}
          {showCreateSchoolModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-6xl h-[90vh] rounded-lg bg-white shadow-xl flex flex-col">
                {/* 头部 */}
                <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">新增学校</h3>
                    <p className="text-sm text-gray-500">在地图上点击勾画学校边界</p>
                  </div>
                  <button
                    onClick={handleCloseCreateSchoolModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* 内容区 */}
                <div className="flex flex-1 overflow-hidden">
                  {/* 左侧：地图 */}
                  <div className="flex-1 relative">
                    {createSchoolMapLoading ? (
                      <div className="flex h-full items-center justify-center bg-gray-100">
                        <div className="text-center">
                          <div className="mb-4 text-lg font-medium text-gray-700">加载地图中...</div>
                          <div className="h-2 w-64 rounded-full bg-gray-200">
                            <div className="h-2 animate-pulse rounded-full bg-blue-500"></div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div ref={createSchoolMapRef} className="h-full w-full" />
                    )}
                  </div>

                  {/* 右侧：表单 */}
                  <div className="w-96 border-l border-gray-200 overflow-y-auto">
                    <div className="p-6 space-y-6">
                      {showGenerateInviteAfterCreate && createdSchoolId ? (
                        /* 创建成功后的邀请码生成步骤 */
                        <div className="space-y-4">
                          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-green-800">
                              <Check className="h-5 w-5" />
                              学校创建成功！
                            </div>
                            <p className="text-xs text-green-700">
                              现在可以为该学校生成管理员邀请码
                            </p>
                          </div>

                          {generatedCode ? (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                              <div className="mb-2 text-sm font-medium text-blue-800">邀请码生成成功！</div>
                              <div className="flex items-center gap-2">
                                <code className="flex-1 rounded bg-white px-3 py-2 font-mono text-lg font-bold text-gray-900">
                                  {generatedCode}
                                </code>
                                <button
                                  onClick={handleCopyCode}
                                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                                >
                                  {copied ? (
                                    <>
                                      <Check className="h-4 w-4" />
                                      已复制
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-4 w-4" />
                                      复制
                                    </>
                                  )}
                                </button>
                              </div>
                              <p className="mt-2 text-xs text-blue-700">
                                请妥善保管此邀请码，分发给该校的主管理员
                              </p>
                            </div>
                          ) : (
                            <button
                              onClick={handleGenerateInviteAfterCreate}
                              disabled={isGenerating}
                              className="w-full rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isGenerating ? "生成中..." : "生成管理员邀请码"}
                            </button>
                          )}

                          <div className="flex gap-3">
                            <button
                              onClick={handleCloseCreateSchoolModal}
                              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                            >
                              完成
                            </button>
                            <button
                              onClick={() => {
                                setShowGenerateInviteAfterCreate(false);
                                setCreatedSchoolId(null);
                                setGeneratedCode("");
                                setNewSchoolName("");
                                setNewSchoolCode("");
                                setBoundaryPoints([]);
                                clearCreateSchoolBoundary();
                              }}
                              className="flex-1 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90"
                            >
                              继续创建
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* 创建学校表单 */
                        <>
                          {/* 学校名称 */}
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              学校名称 <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={newSchoolName}
                              onChange={(e) => setNewSchoolName(e.target.value)}
                              placeholder="例如：北京大学"
                              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                          </div>

                          {/* 学校代码 */}
                          <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              唯一代码 <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={newSchoolCode}
                              onChange={(e) => setNewSchoolCode(e.target.value.toLowerCase())}
                              placeholder="例如：pku"
                              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                            <p className="mt-1 text-xs text-gray-500">唯一代码创建后不可修改</p>
                          </div>

                          {/* 边界点统计 */}
                          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-gray-700">已添加边界点：</span>
                              <span className="text-lg font-bold text-blue-600">{boundaryPoints.length}</span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              {boundaryPoints.length < 3
                                ? "至少需要3个点才能构成多边形边界"
                                : "点击地图继续添加点，或点击保存完成创建"}
                            </p>
                          </div>

                          {/* 操作按钮 */}
                          <div className="flex gap-3">
                            <button
                              onClick={clearCreateSchoolBoundary}
                              disabled={boundaryPoints.length === 0}
                              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <RotateCcw className="h-4 w-4" />
                              清除
                            </button>
                            <button
                              onClick={handleCreateSchool}
                              disabled={isCreatingSchool || !newSchoolName.trim() || !newSchoolCode.trim() || boundaryPoints.length < 3}
                              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#FF4500] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#FF4500]/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isCreatingSchool ? (
                                <>
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                  创建中...
                                </>
                              ) : (
                                <>
                                  <Save className="h-4 w-4" />
                                  保存并创建
                                </>
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
