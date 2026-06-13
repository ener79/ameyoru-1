"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PRICE_BUCKETS_CENTS } from "@/lib/constants";
import { completePlayerInviteAction } from "@/server/actions/users";
import { authClient } from "@/lib/auth-client";
import type { PlayerGender } from "@/db/schema";

const schema = z
  .object({
    displayName: z.string().min(1, "请填写名字").max(32),
    username: z
      .string()
      .min(2, "用户名至少 2 位")
      .max(32)
      .regex(/^[\p{L}\p{N}_.-]+$/u, "用户名只能中文/字母/数字/下划线/点/横线"),
    password: z
      .string()
      .min(9, "密码必须超过 8 位")
      .regex(/(?=.*[a-z])(?=.*[A-Z])/, "密码必须包含大小写字母"),
    confirm: z.string().min(1, "请确认密码"),
    securityCode: z.string().min(6, "安全码至少 6 位"),
    confirmSecurityCode: z.string().min(1, "请确认安全码"),
    playerGender: z.enum(["MALE", "FEMALE"]),
    defaultRate: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "两次密码不一致",
    path: ["confirm"],
  })
  .refine((d) => d.securityCode === d.confirmSecurityCode, {
    message: "两次安全码不一致",
    path: ["confirmSecurityCode"],
  })
  .refine((d) => d.securityCode !== d.password, {
    message: "安全码不能和登录密码一样",
    path: ["securityCode"],
  });

type FormValues = z.infer<typeof schema>;

export function PlayerInviteForm({
  token,
  initialGender,
  initialRateCents,
}: {
  token: string;
  initialGender: PlayerGender;
  initialRateCents: number;
}) {
  const [pending, startTransition] = useTransition();
  const [wechatQr, setWechatQr] = useState<File | null>(null);
  const [alipayQr, setAlipayQr] = useState<File | null>(null);

  const buckets = PRICE_BUCKETS_CENTS[initialGender];
  const initialRate = buckets.includes(initialRateCents)
    ? String(initialRateCents / 100)
    : String(buckets[0] / 100);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      username: "",
      password: "",
      confirm: "",
      securityCode: "",
      confirmSecurityCode: "",
      playerGender: initialGender,
      defaultRate: initialRate,
    },
  });

  const playerGender = form.watch("playerGender");

  function onSubmit(values: FormValues) {
    if (!wechatQr || !alipayQr) {
      toast.error("请上传微信和支付宝收款码");
      return;
    }

    const fd = new FormData();
    fd.set("token", token);
    fd.set("displayName", values.displayName.trim());
    fd.set("username", values.username.trim());
    fd.set("password", values.password);
    fd.set("qrSecurityCode", values.securityCode);
    fd.set("playerGender", values.playerGender);
    fd.set("defaultRateYuan", values.defaultRate);
    fd.set("wechatQr", wechatQr);
    fd.set("alipayQr", alipayQr);

    startTransition(async () => {
      const res = await completePlayerInviteAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const signInRes = await authClient.signIn.username({
        username: values.username.trim(),
        password: values.password,
      });
      if (signInRes.error) {
        toast.success("账号已创建,请登录");
        window.location.assign("/login");
      } else {
        toast.success("账号已创建");
        window.location.assign("/overview");
      }
    });
  }

  return (
    <Card className="p-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>名字</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>用户名允许中文</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>密码</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>确认密码</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormDescription className="-mt-3">
            密码必须超过 8 位,且包含大小写字母
          </FormDescription>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="securityCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>收款码安全码</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmSecurityCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>确认安全码</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormDescription className="-mt-3">
            更换或删除收款码时需要输入,不要和登录密码一样
          </FormDescription>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="playerGender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>分类</FormLabel>
                  <Select value={field.value} onValueChange={(v) => {
                    field.onChange(v);
                    const newBuckets = PRICE_BUCKETS_CENTS[v as PlayerGender];
                    form.setValue("defaultRate", String(newBuckets[0] / 100));
                  }}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="FEMALE">女陪</SelectItem>
                      <SelectItem value="MALE">男陪</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="defaultRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>默认单价(元/小时)</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PRICE_BUCKETS_CENTS[playerGender].map((c) => {
                        const v = String(c / 100);
                        return <SelectItem key={v} value={v}>{v}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <QrInput
              label="微信收款码"
              file={wechatQr}
              onChange={setWechatQr}
            />
            <QrInput
              label="支付宝收款码"
              file={alipayQr}
              onChange={setAlipayQr}
            />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            保存
          </Button>
        </form>
      </Form>
    </Card>
  );
}

function QrInput({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
        <Upload className="size-5" />
        <span>{file ? file.name : `上传${label}`}</span>
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          required
        />
      </label>
    </div>
  );
}
