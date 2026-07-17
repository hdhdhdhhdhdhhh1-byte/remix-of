export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          edited_after_approval: boolean
          id: string
          notes: string | null
          report_date: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          edited_after_approval?: boolean
          id?: string
          notes?: string | null
          report_date: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          edited_after_approval?: boolean
          id?: string
          notes?: string | null
          report_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      leaders: {
        Row: {
          created_at: string
          id: string
          person_id: string | null
          position: string
          unit: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          person_id?: string | null
          position: string
          unit?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          person_id?: string | null
          position?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaders_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      leaves: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          end_date: string
          id: string
          leave_type: string
          person_id: string | null
          reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          end_date: string
          id?: string
          leave_type: string
          person_id?: string | null
          reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          end_date?: string
          id?: string
          leave_type?: string
          person_id?: string | null
          reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
        }
        Relationships: [
          {
            foreignKeyName: "leaves_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      page_visibility: {
        Row: {
          id: string
          page_key: string
          user_id: string
          visible: boolean
        }
        Insert: {
          id?: string
          page_key: string
          user_id: string
          visible?: boolean
        }
        Update: {
          id?: string
          page_key?: string
          user_id?: string
          visible?: boolean
        }
        Relationships: []
      }
      permissions: {
        Row: {
          can_add: boolean
          can_approve: boolean
          can_cancel_approval: boolean
          can_delete: boolean
          can_edit: boolean
          can_export_image: boolean
          can_export_pdf: boolean
          can_print: boolean
          can_view: boolean
          id: string
          module: string
          user_id: string
        }
        Insert: {
          can_add?: boolean
          can_approve?: boolean
          can_cancel_approval?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_export_image?: boolean
          can_export_pdf?: boolean
          can_print?: boolean
          can_view?: boolean
          id?: string
          module: string
          user_id: string
        }
        Update: {
          can_add?: boolean
          can_approve?: boolean
          can_cancel_approval?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_export_image?: boolean
          can_export_pdf?: boolean
          can_print?: boolean
          can_view?: boolean
          id?: string
          module?: string
          user_id?: string
        }
        Relationships: []
      }
      persons: {
        Row: {
          active: boolean
          created_at: string
          formation: string | null
          full_name: string
          id: string
          military_number: string | null
          military_rank: string | null
          notes: string | null
          phone: string | null
          squad: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          formation?: string | null
          full_name: string
          id?: string
          military_number?: string | null
          military_rank?: string | null
          notes?: string | null
          phone?: string | null
          squad?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          formation?: string | null
          full_name?: string
          id?: string
          military_number?: string | null
          military_rank?: string | null
          notes?: string | null
          phone?: string | null
          squad?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          assigned_formation: string | null
          created_at: string
          email: string | null
          full_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_formation?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_formation?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      report_entries: {
        Row: {
          id: string
          note: string | null
          person_id: string
          report_id: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Insert: {
          id?: string
          note?: string | null
          person_id: string
          report_id: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          id?: string
          note?: string | null
          person_id?: string
          report_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "report_entries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_entries_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "daily_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          archived: boolean
          created_at: string
          created_by: string | null
          edited_after_approval: boolean
          id: string
          location: string
          member_1: string | null
          member_2: string | null
          member_3: string | null
          member_4: string | null
          member_5: string | null
          member_6: string | null
          notes: string | null
          recipient: string | null
          service_date: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          archived?: boolean
          created_at?: string
          created_by?: string | null
          edited_after_approval?: boolean
          id?: string
          location: string
          member_1?: string | null
          member_2?: string | null
          member_3?: string | null
          member_4?: string | null
          member_5?: string | null
          member_6?: string | null
          notes?: string | null
          recipient?: string | null
          service_date?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          archived?: boolean
          created_at?: string
          created_by?: string | null
          edited_after_approval?: boolean
          id?: string
          location?: string
          member_1?: string | null
          member_2?: string | null
          member_3?: string | null
          member_4?: string | null
          member_5?: string | null
          member_6?: string | null
          notes?: string | null
          recipient?: string | null
          service_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_member_1_fkey"
            columns: ["member_1"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_member_2_fkey"
            columns: ["member_2"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_member_3_fkey"
            columns: ["member_3"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_member_4_fkey"
            columns: ["member_4"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_member_5_fkey"
            columns: ["member_5"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_member_6_fkey"
            columns: ["member_6"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weapons: {
        Row: {
          assigned_to: string | null
          condition: string
          created_at: string
          id: string
          notes: string | null
          serial_number: string
          weapon_type: string
        }
        Insert: {
          assigned_to?: string | null
          condition?: string
          created_at?: string
          id?: string
          notes?: string | null
          serial_number: string
          weapon_type: string
        }
        Update: {
          assigned_to?: string | null
          condition?: string
          created_at?: string
          id?: string
          notes?: string | null
          serial_number?: string
          weapon_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "weapons_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      latest_approved_report_date: { Args: never; Returns: string }
      my_is_admin: { Args: never; Returns: boolean }
      my_pages: {
        Args: never
        Returns: {
          page_key: string
          visible: boolean
        }[]
      }
      my_permissions: {
        Args: never
        Returns: {
          can_add: boolean
          can_approve: boolean
          can_cancel_approval: boolean
          can_delete: boolean
          can_edit: boolean
          can_export_image: boolean
          can_export_pdf: boolean
          can_print: boolean
          can_view: boolean
          module: string
        }[]
      }
      my_role: { Args: never; Returns: Database["public"]["Enums"]["app_role"] }
      person_current_status: { Args: { _person_id: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "owner"
        | "admin"
        | "leader"
        | "viewer"
        | "platoon_leader"
        | "office"
        | "battery_commander"
      attendance_status:
        | "present"
        | "absent"
        | "leave"
        | "sick"
        | "permit"
        | "mission"
        | "course"
        | "other"
      leave_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "owner",
        "admin",
        "leader",
        "viewer",
        "platoon_leader",
        "office",
        "battery_commander",
      ],
      attendance_status: [
        "present",
        "absent",
        "leave",
        "sick",
        "permit",
        "mission",
        "course",
        "other",
      ],
      leave_status: ["pending", "approved", "rejected"],
    },
  },
} as const
